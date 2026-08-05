import type { CategoryMatch, ClassifyCategoryResult, LeadStatus } from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { getCategoryById, listActiveCategories } from '../../db/repositories/categoriesRepository.js';
import { listActiveCategorizationRules } from '../../db/repositories/categorizationRulesRepository.js';
import {
  replaceSecondaryCategories,
  type SecondaryCategoryInput,
} from '../../db/repositories/leadCategoriesRepository.js';
import { getLeadById, updateLeadCategorization } from '../../db/repositories/leadsRepository.js';
import { getAIProvider } from '../../providers/ai/index.js';
import { AIConfigError, isQuotaOrRateLimitError } from '../../providers/ai/errors.js';
import { triggerDeckGeneration } from '../deckGeneration/deckGenerationService.js';
import { evaluateRules, MAX_SECONDARY_CATEGORIES } from './ruleEngine.js';

/**
 * A lead in one of these statuses hasn't been through categorization yet (or needs another
 * pass) — categorization is allowed to advance its status. A lead further along the pipeline
 * (categorized, deck_generated, in_sequence, ...) keeps its status untouched even when manually
 * re-categorized after a rule change — updating its category shouldn't silently reset pipeline
 * progress; only the category/confidence fields themselves get refreshed.
 */
const PRE_CATEGORIZATION_STATUSES: LeadStatus[] = ['new', 'needs_review'];

function mergeSecondaries(
  ruleSecondary: CategoryMatch[],
  aiSecondaryIds: string[],
  aiConfidence: number,
  excludeCategoryId: string | null,
): SecondaryCategoryInput[] {
  const byCategory = new Map<string, SecondaryCategoryInput>();

  for (const match of ruleSecondary) {
    if (match.categoryId === excludeCategoryId) continue;
    byCategory.set(match.categoryId, {
      categoryId: match.categoryId,
      confidence: match.confidence,
      method: 'rule_based',
    });
  }

  for (const categoryId of aiSecondaryIds) {
    if (categoryId === excludeCategoryId) continue;
    const existing = byCategory.get(categoryId);
    if (!existing || aiConfidence > existing.confidence) {
      byCategory.set(categoryId, { categoryId, confidence: aiConfidence, method: 'ai' });
    }
  }

  return [...byCategory.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SECONDARY_CATEGORIES);
}

/**
 * Deck generation (Phase 3) triggers whenever categorization actually changes the primary
 * category — first-time categorization, or a correction after a rule/data fix — never on a
 * no-op re-run that confirms the same category. Deck generation runs behind its own queue/
 * worker; a failure to even enqueue it must never surface as a categorization failure, so it's
 * caught and logged here rather than propagated.
 */
async function maybeTriggerDeckGeneration(
  leadId: string,
  previousCategoryId: string | null,
  newCategoryId: string | null,
): Promise<void> {
  if (!newCategoryId || newCategoryId === previousCategoryId) return;

  try {
    await triggerDeckGeneration(leadId);
  } catch (err) {
    console.error(`[categorization] failed to trigger deck generation for lead ${leadId}:`, err);
  }
}

/**
 * Runs the full hybrid categorization pipeline for one lead: rules first; AI fallback only when
 * rules don't produce a confident primary match. AI failures are NOT caught here — they
 * propagate to the caller (the BullMQ worker), which owns retry/backoff and the "give up after
 * N attempts" decision. This function only decides what a *successful* categorization result
 * (rule-based, or a completed AI call) means for the lead.
 */
export async function categorizeLead(leadId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error(`Cannot categorize: lead not found (${leadId})`);
  }

  const nextStatusIfAdvancing = (outcome: LeadStatus): LeadStatus =>
    PRE_CATEGORIZATION_STATUSES.includes(lead.status) ? outcome : lead.status;

  const rules = await listActiveCategorizationRules();
  const ruleResult = evaluateRules(
    {
      industry: lead.industry,
      companyName: lead.companyName,
      website: lead.website,
      rawData: lead.rawData,
    },
    rules,
  );

  if (ruleResult.primary) {
    await updateLeadCategorization(leadId, {
      categoryId: ruleResult.primary.categoryId,
      categorizationMethod: 'rule_based',
      categorizationConfidence: ruleResult.primary.confidence,
      status: nextStatusIfAdvancing('categorized'),
      reviewReason: null,
    });
    await replaceSecondaryCategories(
      leadId,
      ruleResult.secondary.map((m) => ({
        categoryId: m.categoryId,
        confidence: m.confidence,
        method: 'rule_based',
      })),
    );
    await maybeTriggerDeckGeneration(leadId, lead.categoryId, ruleResult.primary.categoryId);
    return;
  }

  const candidateCategories = await listActiveCategories();
  const aiResult = await getAIProvider().categorizeLead({
    leadId,
    companyName: lead.companyName ?? undefined,
    industry: lead.industry ?? undefined,
    website: lead.website ?? undefined,
    rawData: lead.rawData,
    candidateCategories,
  });

  const aiConfidence = aiResult.confidence ?? 0;
  const isTrustworthy =
    aiResult.categoryId !== null && aiConfidence >= env.AI_CATEGORIZATION_MIN_CONFIDENCE;

  if (!isTrustworthy) {
    await updateLeadCategorization(leadId, {
      categoryId: null,
      categorizationMethod: 'ai',
      categorizationConfidence: aiResult.confidence,
      status: nextStatusIfAdvancing('needs_review'),
      reviewReason: 'ai_categorization_low_confidence',
    });
    await replaceSecondaryCategories(
      leadId,
      ruleResult.secondary.map((m) => ({
        categoryId: m.categoryId,
        confidence: m.confidence,
        method: 'rule_based',
      })),
    );
    return;
  }

  await updateLeadCategorization(leadId, {
    categoryId: aiResult.categoryId,
    categorizationMethod: 'ai',
    categorizationConfidence: aiConfidence,
    status: nextStatusIfAdvancing('categorized'),
    reviewReason: null,
  });
  await replaceSecondaryCategories(
    leadId,
    mergeSecondaries(
      ruleResult.secondary,
      aiResult.secondaryCategoryIds ?? [],
      aiConfidence,
      aiResult.categoryId,
    ),
  );
  await maybeTriggerDeckGeneration(leadId, lead.categoryId, aiResult.categoryId);
}

/**
 * Called by the categorization worker once BullMQ retries are exhausted (or immediately on a
 * non-retryable AIConfigError) — the documented fallback: never block the pipeline or guess,
 * just flag for manual review.
 */
export async function markCategorizationFailed(leadId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) return;

  await updateLeadCategorization(leadId, {
    categoryId: null,
    categorizationMethod: null,
    categorizationConfidence: null,
    status: PRE_CATEGORIZATION_STATUSES.includes(lead.status) ? 'needs_review' : lead.status,
    reviewReason: 'ai_categorization_failed',
  });
}

/** Retried transient failures (network, malformed response); AIConfigError never is — see classifyNewCategory. */
const CLASSIFY_CATEGORY_MAX_ATTEMPTS = 3;

/**
 * Thrown when AI classification of a manually-created category (Phase 6 "Add category", name
 * only) fails after every attempt. Callers (the route) must treat this as "do not create the
 * category" — never fall back to a null/guessed service_group, since that would silently break
 * deck generation and the rule engine for every future lead this category is assigned to.
 */
export class CategoryClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryClassificationError';
  }
}

/**
 * Thrown instead of the base CategoryClassificationError when every attempt failed specifically
 * on a 429/quota-exhausted response (see isQuotaOrRateLimitError). Distinguished from other
 * classification failures (malformed response, network error, bad API key) because the route
 * treats it differently: those still block category creation and surface "Retry"; this one
 * doesn't block creation at all — the category is created with a manual-review default instead.
 */
export class CategoryClassificationQuotaError extends CategoryClassificationError {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryClassificationQuotaError';
  }
}

/**
 * AI-classifies a new category's name into one of the 4 fixed service_group values and proposes
 * a starter keyword rule set — the "name only" path for manual category creation (Phase 6
 * dashboard). Retries transient failures up to CLASSIFY_CATEGORY_MAX_ATTEMPTS times; AIConfigError
 * (missing/invalid API key) is never retried, the same non-retryable/retryable distinction the
 * categorization worker makes for categorizeLead. Throws CategoryClassificationError — never
 * returns a partial/guessed result — if every attempt fails; throws the CategoryClassificationQuotaError
 * subclass specifically when the last failure was a 429/quota error, so the caller can offer its
 * own fallback instead of just failing.
 */
export async function classifyNewCategory(name: string): Promise<ClassifyCategoryResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CLASSIFY_CATEGORY_MAX_ATTEMPTS; attempt++) {
    try {
      return await getAIProvider().classifyCategory({ name });
    } catch (err) {
      lastError = err;
      const status = err && typeof err === 'object' && 'status' in err ? (err as { status?: unknown }).status : undefined;
      console.error(
        `[categorization] category classification attempt ${attempt}/${CLASSIFY_CATEGORY_MAX_ATTEMPTS} failed for "${name}" (status=${status ?? 'n/a'}):`,
        err,
      );
      if (err instanceof AIConfigError) {
        // Retrying a missing/invalid API key can never succeed — don't burn the remaining attempts.
        break;
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  const message = `AI classification failed for category "${name}": ${reason}`;
  if (isQuotaOrRateLimitError(lastError)) {
    throw new CategoryClassificationQuotaError(message);
  }
  throw new CategoryClassificationError(message);
}

export class CategoryNotFoundError extends Error {
  constructor(categoryId: string) {
    super(`Category not found: ${categoryId}`);
    this.name = 'CategoryNotFoundError';
  }
}

/**
 * Human override for a lead automatic categorization couldn't resolve (e.g. no confident rule
 * match and the AI provider is unavailable/quota-exhausted) — the dashboard's needs-review queue
 * exposes this as the manual fallback. Deliberately mirrors categorizeLead's own status-
 * advancement (nextStatusIfAdvancing) and deck-generation-triggering (maybeTriggerDeckGeneration)
 * behavior exactly, so a manually-categorized lead moves through the rest of the pipeline
 * identically to an automatically-categorized one — categorization_method = 'manual' and a NULL
 * confidence (there's no score to report; a human just picked it) are the only differences
 * recorded. No AI/rule call, so this is synchronous — unlike categorizeLead, callers don't need
 * a queue/worker round trip for it.
 */
export async function assignCategoryManually(leadId: string, categoryId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error(`Cannot assign category: lead not found (${leadId})`);
  }

  const category = await getCategoryById(categoryId);
  if (!category) {
    throw new CategoryNotFoundError(categoryId);
  }

  const nextStatus = PRE_CATEGORIZATION_STATUSES.includes(lead.status)
    ? 'categorized'
    : lead.status;

  await updateLeadCategorization(leadId, {
    categoryId,
    categorizationMethod: 'manual',
    categorizationConfidence: null,
    status: nextStatus,
    reviewReason: null,
  });

  await maybeTriggerDeckGeneration(leadId, lead.categoryId, categoryId);
}
