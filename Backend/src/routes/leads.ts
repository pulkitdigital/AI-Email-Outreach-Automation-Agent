import { Router } from 'express';
import type { LeadStatus, SequenceStage } from '@bebeyond/shared';
import { getCategoryById } from '../db/repositories/categoriesRepository.js';
import {
  getLeadById,
  listLeads,
  updateLeadFields,
  type ListLeadsFilters,
} from '../db/repositories/leadsRepository.js';
import { getSequenceForLead } from '../db/repositories/emailSequencesRepository.js';
import { getLatestPitchDeckForLead } from '../db/repositories/pitchDecksRepository.js';
import { listSentEmailLogsForLead } from '../db/repositories/sentEmailsLogRepository.js';
import { confirmLead } from '../modules/leads/leadReviewService.js';
import { LeadReviewPreconditionError } from '../modules/leads/errors.js';
import type { MergeableLeadFields } from '../modules/ingestion/normalize.js';
import {
  assignCategoryManually,
  CategoryNotFoundError,
} from '../modules/categorization/categorizationService.js';

export const leadsRouter = Router();

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

const VALID_SEQUENCE_STAGES: SequenceStage[] = [
  'new',
  'followup',
  'final',
  'completed',
  'stopped_reply',
  'stopped_bounce',
  'stopped_unsubscribe',
  'stopped_manual',
];

const EDITABLE_FIELDS = [
  'companyName',
  'contactName',
  'phone',
  'website',
  'industry',
  'country',
  'region',
] as const;

function parsePatch(body: unknown): Partial<MergeableLeadFields> {
  const patch: Partial<MergeableLeadFields> = {};
  if (typeof body !== 'object' || body === null) return patch;
  const record = body as Record<string, unknown>;

  for (const field of EDITABLE_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' || value === null) {
      patch[field] = value;
    }
  }
  return patch;
}

/**
 * GET /api/leads — the dashboard's main leads table (Phase 6): filterable by status/category/
 * sequence stage, searchable, paginated. Genuinely new — no general lead-listing endpoint
 * existed before this phase (only single-status id lists used internally by bulk recategorize).
 */
leadsRouter.get('/', async (req, res) => {
  const { status, categoryId, sequenceStage, search, page, pageSize } = req.query as Record<
    string,
    string | undefined
  >;

  const filters: ListLeadsFilters = {};
  if (status) {
    if (!VALID_STATUSES.includes(status as LeadStatus)) {
      res.status(400).json({ error: `Invalid status: ${status}` });
      return;
    }
    filters.status = status as LeadStatus;
  }
  if (categoryId) filters.categoryId = categoryId;
  if (sequenceStage) {
    if (!VALID_SEQUENCE_STAGES.includes(sequenceStage as SequenceStage)) {
      res.status(400).json({ error: `Invalid sequenceStage: ${sequenceStage}` });
      return;
    }
    filters.sequenceStage = sequenceStage as SequenceStage;
  }
  if (search) filters.search = search;

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));

  try {
    const result = await listLeads(filters, {
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
    });
    res.json({ ...result, page: pageNum, pageSize: pageSizeNum });
  } catch (err) {
    console.error('[leads-route] failed to list leads:', err);
    res.status(500).json({ error: 'Failed to list leads — see server logs for details' });
  }
});

/** GET /api/leads/:id — full lead detail: profile + category name + sequence + latest deck + sent log, one round trip for the dashboard's detail page. */
leadsRouter.get('/:id', async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const [category, sequence, latestDeck, sentLogs] = await Promise.all([
      lead.categoryId ? getCategoryById(lead.categoryId) : Promise.resolve(null),
      getSequenceForLead(lead.id),
      getLatestPitchDeckForLead(lead.id),
      listSentEmailLogsForLead(lead.id),
    ]);

    res.json({ ...lead, category, sequence, latestDeck, sentLogs });
  } catch (err) {
    console.error(`[leads-route] failed to fetch lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to fetch lead — see server logs for details' });
  }
});

/**
 * PATCH /api/leads/:id — inline edit of the free-text profile fields (dashboard needs-review
 * queue), and/or a manual category assignment via `categoryId` in the body. The two are
 * independent: either can be sent alone, or both together in one call. A manual categoryId
 * assignment goes through assignCategoryManually() (categorizationService.ts) — same status-
 * advancement and deck-generation-triggering behavior as automatic categorization, just with
 * categorization_method = 'manual' and no confidence score.
 */
leadsRouter.patch('/:id', async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const fieldPatch = parsePatch(req.body);
    if (Object.keys(fieldPatch).length > 0) {
      await updateLeadFields(req.params.id, fieldPatch);
    }

    const { categoryId } = (req.body ?? {}) as { categoryId?: unknown };
    if (categoryId !== undefined) {
      if (typeof categoryId !== 'string' || !categoryId) {
        res.status(400).json({ error: 'categoryId must be a non-empty string' });
        return;
      }
      try {
        await assignCategoryManually(req.params.id, categoryId);
      } catch (err) {
        if (err instanceof CategoryNotFoundError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }
    }

    const updated = await getLeadById(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(`[leads-route] failed to update lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to update lead — see server logs for details' });
  }
});

/**
 * POST /api/leads/:id/confirm — the dashboard's "needs review" queue action: apply any edits
 * made inline, then move the lead out of needs_review and back into the normal pipeline
 * (re-running categorization, exactly as the existing recategorize endpoint does — confirming
 * a fixed-up lead's data is not meaningfully different from asking to recategorize it).
 */
leadsRouter.post('/:id/confirm', async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const updated = await confirmLead(req.params.id, parsePatch(req.body));
    res.status(202).json({ leadId: updated.id, status: 'queued' });
  } catch (err) {
    if (err instanceof LeadReviewPreconditionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(`[leads-route] failed to confirm lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to confirm lead — see server logs for details' });
  }
});
