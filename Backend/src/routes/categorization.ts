import { Router } from 'express';
import type { LeadStatus } from '@bebeyond/shared';
import { listActiveCategories } from '../db/repositories/categoriesRepository.js';
import { getLeadById, listLeadIdsByStatus } from '../db/repositories/leadsRepository.js';
import { enqueueCategorizationJob } from '../queue/queues.js';

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
