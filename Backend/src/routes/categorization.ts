import { Router } from 'express';
import type {
  CategorizationRuleMatchField,
  CategorizationRuleMatchType,
  LeadStatus,
  ServiceGroup,
} from '@bebeyond/shared';
import {
  categorySlugExists,
  createCategory,
  listActiveCategories,
} from '../db/repositories/categoriesRepository.js';
import { createCategorizationRules } from '../db/repositories/categorizationRulesRepository.js';
import { getLeadById, listLeadIdsByStatus } from '../db/repositories/leadsRepository.js';
import { enqueueCategorizationJob } from '../queue/queues.js';
import {
  classifyNewCategory,
  CategoryClassificationError,
  CategoryClassificationQuotaError,
} from '../modules/categorization/categorizationService.js';

export const categorizationRouter = Router();

/** GET /api/categorization/categories — the 4 active service categories, for dashboard filter dropdowns (Phase 6). */
categorizationRouter.get('/categories', async (_req, res) => {
  try {
    const categories = await listActiveCategories();
    res.json(categories);
  } catch (err) {
    console.error('[categorization-route] failed to list categories:', err);
    res.status(500).json({ error: 'Failed to list categories — see server logs for details' });
  }
});

const VALID_SERVICE_GROUPS: ServiceGroup[] = [
  'digital_marketing',
  'web_app_solutions',
  'creative_services',
  'marketplace_commerce',
];

const VALID_MATCH_FIELDS: CategorizationRuleMatchField[] = [
  'industry',
  'company_name',
  'website',
  'raw_data',
  'any',
];

const VALID_MATCH_TYPES: CategorizationRuleMatchType[] = ['keyword', 'regex'];

const DEFAULT_RULE_WEIGHT = 0.35;

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'category';
}

interface ParsedRuleInput {
  matchField: CategorizationRuleMatchField;
  matchType: CategorizationRuleMatchType;
  pattern: string;
  weight: number;
}

/** Returns an error string if `rules` is malformed, otherwise the parsed (unattached) rule inputs. */
function parseRuleInputs(rules: unknown): ParsedRuleInput[] | string {
  if (rules === undefined) return [];
  if (!Array.isArray(rules)) return '"rules" must be an array';

  const parsed: ParsedRuleInput[] = [];
  for (const raw of rules) {
    if (!raw || typeof raw !== 'object') return 'each rule must be an object';
    const { matchField, matchType, pattern, weight } = raw as Record<string, unknown>;

    if (
      typeof matchField !== 'string' ||
      !VALID_MATCH_FIELDS.includes(matchField as CategorizationRuleMatchField)
    ) {
      return `each rule's "matchField" must be one of: ${VALID_MATCH_FIELDS.join(', ')}`;
    }
    if (typeof pattern !== 'string' || !pattern.trim()) {
      return 'each rule must include a non-empty "pattern"';
    }

    const resolvedMatchType = matchType ?? 'keyword';
    if (
      typeof resolvedMatchType !== 'string' ||
      !VALID_MATCH_TYPES.includes(resolvedMatchType as CategorizationRuleMatchType)
    ) {
      return `each rule's "matchType" must be one of: ${VALID_MATCH_TYPES.join(', ')}`;
    }

    const resolvedWeight = weight === undefined ? DEFAULT_RULE_WEIGHT : Number(weight);
    if (!Number.isFinite(resolvedWeight) || resolvedWeight <= 0) {
      return 'each rule\'s "weight" must be a positive number';
    }

    parsed.push({
      matchField: matchField as CategorizationRuleMatchField,
      matchType: resolvedMatchType as CategorizationRuleMatchType,
      pattern: pattern.trim(),
      weight: resolvedWeight,
    });
  }
  return parsed;
}

/**
 * POST /api/categorization/categories — manual category creation (Phase 6 dashboard), for the
 * rare case a lead's business genuinely doesn't fit the 4 seeded categories. The dashboard only
 * ever sends `{ name }`: when `serviceGroup` is omitted, the AI provider classifies the name
 * into one of the 4 fixed service groups and proposes a starter keyword rule set (see
 * classifyNewCategory) — no manual dropdown, no manual rule authoring. `serviceGroup`/`rules`
 * are still accepted explicitly for backward compatibility (e.g. scripted/seed callers); when
 * given, no AI call is made and they're used as-is, same as before this change. Slug is always
 * auto-generated from `name` when omitted, de-duped against existing slugs; an explicitly
 * provided slug that collides is rejected outright rather than silently altered.
 */
categorizationRouter.post('/categories', async (req, res) => {
  const { name, slug: rawSlug, serviceGroup, rules } = (req.body ?? {}) as {
    name?: unknown;
    slug?: unknown;
    serviceGroup?: unknown;
    rules?: unknown;
  };

  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Request body must include a non-empty "name"' });
    return;
  }
  const trimmedName = name.trim();

  if (serviceGroup !== undefined && typeof serviceGroup !== 'string') {
    res.status(400).json({ error: '"serviceGroup" must be a string when provided' });
    return;
  }
  if (
    typeof serviceGroup === 'string' &&
    !VALID_SERVICE_GROUPS.includes(serviceGroup as ServiceGroup)
  ) {
    res
      .status(400)
      .json({ error: `"serviceGroup" must be one of: ${VALID_SERVICE_GROUPS.join(', ')}` });
    return;
  }

  let resolvedServiceGroup: ServiceGroup | null;
  let ruleInputs: ParsedRuleInput[];
  let needsReview = false;
  let reviewReason: string | null = null;

  if (typeof serviceGroup === 'string') {
    // Explicit path (backward compat) — no AI call, `rules` (if any) used as given.
    const parsedRules = parseRuleInputs(rules);
    if (typeof parsedRules === 'string') {
      res.status(400).json({ error: parsedRules });
      return;
    }
    resolvedServiceGroup = serviceGroup as ServiceGroup;
    ruleInputs = parsedRules;
  } else {
    // Name-only path — AI decides both the service group and the starter rules.
    try {
      const classification = await classifyNewCategory(trimmedName);
      resolvedServiceGroup = classification.serviceGroup;
      ruleInputs = classification.rules.map((r) => ({
        matchField: r.matchField,
        matchType: 'keyword',
        pattern: r.pattern,
        weight: r.weight,
      }));
    } catch (err) {
      console.error(
        `[categorization-route] failed to classify new category "${trimmedName}":`,
        err instanceof Error ? { name: err.name, message: err.message } : err,
      );

      if (err instanceof CategoryClassificationQuotaError) {
        // Quota/rate-limit exhaustion is not the user's fault and retrying immediately won't
        // help either — don't block category creation on it. Create the category with a generic
        // starter rule (the name itself, as a weak 'any'-field match) and no service group, and
        // flag it for a human to fill in once the AI provider is available again.
        resolvedServiceGroup = null;
        ruleInputs = [
          { matchField: 'any', matchType: 'keyword', pattern: trimmedName, weight: DEFAULT_RULE_WEIGHT },
        ];
        needsReview = true;
        reviewReason = 'ai_classification_quota_exceeded';
      } else {
        // Any other classification failure (malformed AI response, network error, bad API key)
        // still blocks creation — a bad guess here would silently break the rule engine and
        // deck generation for every future lead assigned to this category. The user can retry.
        const message =
          err instanceof CategoryClassificationError ? err.message : 'AI classification failed';
        res.status(502).json({ error: message });
        return;
      }
    }
  }

  try {
    let slug: string;
    if (typeof rawSlug === 'string' && rawSlug.trim()) {
      slug = slugify(rawSlug);
      if (await categorySlugExists(slug)) {
        res.status(409).json({ error: `Category slug already in use: ${slug}` });
        return;
      }
    } else {
      const base = slugify(trimmedName);
      slug = base;
      let suffix = 2;
      while (await categorySlugExists(slug)) {
        slug = `${base}-${suffix}`;
        suffix += 1;
      }
    }

    const category = await createCategory({
      name: trimmedName,
      slug,
      serviceGroup: resolvedServiceGroup,
      needsReview,
      reviewReason,
    });

    if (ruleInputs.length > 0) {
      await createCategorizationRules(
        ruleInputs.map((r) => ({ ...r, categoryId: category.id })),
      );
    }

    res.status(201).json(category);
  } catch (err) {
    console.error('[categorization-route] failed to create category:', err);
    res.status(500).json({ error: 'Failed to create category — see server logs for details' });
  }
});

const VALID_STATUSES: LeadStatus[] = [
  'new',
  'needs_review',
  'categorized',
  'deck_generated',
  'in_sequence',
  'completed',
  'replied',
  'bounced',
  'do_not_contact',
];

/**
 * POST /api/categorization/leads/:id/recategorize — re-run categorization for a single lead on
 * demand (e.g. after fixing its data, or just to see how it scores against current rules).
 */
categorizationRouter.post('/leads/:id/recategorize', async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    await enqueueCategorizationJob({ leadId: lead.id });
    res.status(202).json({ leadId: lead.id, status: 'queued' });
  } catch (err) {
    console.error(
      `[categorization-route] failed to enqueue recategorize for ${req.params.id}:`,
      err,
    );
    res
      .status(500)
      .json({ error: 'Failed to enqueue recategorization — see server logs for details' });
  }
});

/**
 * POST /api/categorization/recategorize — bulk re-run, e.g. after tuning categorization_rules.
 * Body: { "leadIds": ["..."] } for an explicit list, or { "status": "categorized" } to bulk-
 * select every lead currently in that status (capped — see leadsRepository.listLeadIdsByStatus).
 */
categorizationRouter.post('/recategorize', async (req, res) => {
  const { leadIds, status } = (req.body ?? {}) as { leadIds?: unknown; status?: unknown };

  try {
    let targetIds: string[];

    if (Array.isArray(leadIds) && leadIds.every((id) => typeof id === 'string')) {
      targetIds = leadIds;
    } else if (typeof status === 'string' && VALID_STATUSES.includes(status as LeadStatus)) {
      targetIds = await listLeadIdsByStatus(status as LeadStatus);
    } else {
      res.status(400).json({
        error: 'Request body must include either "leadIds" (string array) or a valid "status"',
      });
      return;
    }

    for (const leadId of targetIds) {
      await enqueueCategorizationJob({ leadId });
    }

    res.status(202).json({ queuedCount: targetIds.length });
  } catch (err) {
    console.error('[categorization-route] failed to enqueue bulk recategorize:', err);
    res
      .status(500)
      .json({ error: 'Failed to enqueue bulk recategorization — see server logs for details' });
  }
});
