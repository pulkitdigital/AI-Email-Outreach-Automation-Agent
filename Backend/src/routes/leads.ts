import { Router } from 'express';
import type { LeadStatus, SequenceStage, WhatsAppOptInSource } from '@bebeyond/shared';
import { getCategoryById } from '../db/repositories/categoriesRepository.js';
import {
  getLeadById,
  listLeads,
  setLeadStatusManually,
  softDeleteLead,
  updateLeadFields,
  type ListLeadsFilters,
} from '../db/repositories/leadsRepository.js';
import { optInLeadForWhatsApp } from '../db/repositories/whatsappRepository.js';
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
import {
  sendWhatsAppFreeformMessage,
  sendWhatsAppTemplateMessage,
} from '../modules/whatsapp/whatsappService.js';
import {
  WhatsAppConfigError,
  WhatsAppFreeformWindowExpiredError,
  WhatsAppNoNumberError,
  WhatsAppNotOptedInError,
} from '../providers/whatsapp/errors.js';

export const leadsRouter = Router();

const VALID_STATUSES: LeadStatus[] = [
  'new',
  'needs_review',
  'categorized',
  'deck_generated',
  'in_sequence',
  'completed',
  'contacted',
  'replied',
  'converted',
  'not_interested',
  'unsubscribed',
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
 * PATCH /api/leads/:id/status — the dashboard's manual status-change action, independent of the
 * automated pipeline's own status transitions (categorization/deck generation/sending/reply
 * tracking). Goes through setLeadStatusManually, not updateLeadFields/updateLeadCategorization —
 * see that function's docstring for why a manual change always takes effect (no protected-status
 * guard) while automation's own status writes do get guarded against overwriting it afterward.
 */
leadsRouter.patch('/:id/status', async (req, res) => {
  const { status } = (req.body ?? {}) as { status?: unknown };

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as LeadStatus)) {
    res.status(400).json({ error: `"status" must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const updated = await setLeadStatusManually(req.params.id, status as LeadStatus);
    res.json(updated);
  } catch (err) {
    console.error(`[leads-route] failed to update status for lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to update lead status — see server logs for details' });
  }
});

/**
 * DELETE /api/leads/:id — the dashboard's per-row "Delete" action. Always archives (soft-delete)
 * rather than removing the row — see softDeleteLead's docstring for why a hard delete isn't safe
 * here (sent_emails_log/email_sequences CASCADE off leads.id, so it would destroy send history).
 * Idempotent: deleting an already-archived lead just returns it unchanged rather than erroring.
 */
leadsRouter.delete('/:id', async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const archived = (await softDeleteLead(req.params.id)) ?? lead;
    res.json({ id: archived.id, deletedAt: archived.deletedAt });
  } catch (err) {
    console.error(`[leads-route] failed to delete lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to delete lead — see server logs for details' });
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

const VALID_MANUAL_WHATSAPP_OPT_IN_SOURCES: WhatsAppOptInSource[] = ['manual', 'reply_offer'];

/**
 * POST /api/leads/:id/whatsapp/opt-in — the dashboard's staff-facing "Mark as opted in" action
 * (Phase 7 WhatsApp channel): covers the reply-based opt-in path, where a lead shares consent to
 * be contacted on WhatsApp via an email reply and staff manually records the number. This is the
 * ONLY route allowed to call optInLeadForWhatsApp directly (see that function's docstring) — the
 * webhook route calls it too, for the click-to-WhatsApp path, but with a fixed source it
 * controls itself, never from request input.
 */
leadsRouter.post('/:id/whatsapp/opt-in', async (req, res) => {
  const { phoneNumber, source } = (req.body ?? {}) as { phoneNumber?: unknown; source?: unknown };

  if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    res.status(400).json({ error: 'Request body must include a non-empty "phoneNumber"' });
    return;
  }
  const resolvedSource = source === undefined ? 'manual' : source;
  if (
    typeof resolvedSource !== 'string' ||
    !VALID_MANUAL_WHATSAPP_OPT_IN_SOURCES.includes(resolvedSource as WhatsAppOptInSource)
  ) {
    res.status(400).json({
      error: `"source" must be one of: ${VALID_MANUAL_WHATSAPP_OPT_IN_SOURCES.join(', ')}`,
    });
    return;
  }

  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const updated = await optInLeadForWhatsApp(
      req.params.id,
      phoneNumber.trim(),
      resolvedSource as WhatsAppOptInSource,
    );
    res.json(updated);
  } catch (err) {
    console.error(`[leads-route] failed to opt in lead ${req.params.id} for WhatsApp:`, err);
    res.status(500).json({ error: 'Failed to record WhatsApp opt-in — see server logs for details' });
  }
});

/**
 * POST /api/leads/:id/whatsapp/send — the dashboard's manual WhatsApp send action (channel
 * infrastructure only, per the Phase 7 spec — NOT wired into the Daily Scheduler). Both branches
 * go through whatsappService, which re-checks whatsapp_opted_in fresh from the DB before ever
 * touching the provider — this route never bypasses that.
 */
leadsRouter.post('/:id/whatsapp/send', async (req, res) => {
  const body = (req.body ?? {}) as {
    type?: unknown;
    templateName?: unknown;
    language?: unknown;
    variables?: unknown;
    body?: unknown;
  };

  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    if (body.type === 'template') {
      if (typeof body.templateName !== 'string' || !body.templateName.trim()) {
        res.status(400).json({ error: '"templateName" is required for a template send' });
        return;
      }
      const language = typeof body.language === 'string' && body.language ? body.language : 'en';
      const variables =
        body.variables && typeof body.variables === 'object'
          ? (body.variables as Record<string, string>)
          : {};

      await sendWhatsAppTemplateMessage(req.params.id, body.templateName, language, variables);
      res.status(202).json({ status: 'sent' });
      return;
    }

    if (body.type === 'freeform') {
      if (typeof body.body !== 'string' || !body.body.trim()) {
        res.status(400).json({ error: '"body" is required for a freeform send' });
        return;
      }

      await sendWhatsAppFreeformMessage(req.params.id, body.body);
      res.status(202).json({ status: 'sent' });
      return;
    }

    res.status(400).json({ error: '"type" must be "template" or "freeform"' });
  } catch (err) {
    if (
      err instanceof WhatsAppNotOptedInError ||
      err instanceof WhatsAppNoNumberError ||
      err instanceof WhatsAppFreeformWindowExpiredError
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof WhatsAppConfigError) {
      res.status(503).json({ error: err.message });
      return;
    }
    console.error(`[leads-route] failed to send WhatsApp message to lead ${req.params.id}:`, err);
    res
      .status(502)
      .json({ error: 'Failed to send WhatsApp message — see server logs for details' });
  }
});
