import { Router } from 'express';
import type { EmailProviderName, SentEmailStatus } from '@bebeyond/shared';
import { getLeadById } from '../db/repositories/leadsRepository.js';
import {
  listSentEmailLogs,
  listSentEmailLogsForLead,
  type ListSentEmailLogsFilters,
} from '../db/repositories/sentEmailsLogRepository.js';
import { enqueueSendEmailJob } from '../queue/queues.js';

export const sendingRouter = Router();

const VALID_STAGES = ['new', 'followup', 'final'] as const;
const VALID_STATUSES: SentEmailStatus[] = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'opened',
  'cancelled',
];
const VALID_PROVIDERS: EmailProviderName[] = ['brevo', 'gmail'];

/**
 * GET /api/sending/logs — the dashboard's global sent-email-log table (Phase 6): every send
 * across every lead, filterable/searchable/paginated. Genuinely new — the only existing log
 * endpoint below is scoped to a single lead.
 */
sendingRouter.get('/logs', async (req, res) => {
  const { status, providerName, categoryId, stage, search, page, pageSize } = req.query as Record<
    string,
    string | undefined
  >;

  const filters: ListSentEmailLogsFilters = {};
  if (status) {
    if (!VALID_STATUSES.includes(status as SentEmailStatus)) {
      res.status(400).json({ error: `Invalid status: ${status}` });
      return;
    }
    filters.status = status as SentEmailStatus;
  }
  if (providerName) {
    if (!VALID_PROVIDERS.includes(providerName as EmailProviderName)) {
      res.status(400).json({ error: `Invalid providerName: ${providerName}` });
      return;
    }
    filters.providerName = providerName as EmailProviderName;
  }
  if (categoryId) filters.categoryId = categoryId;
  if (stage) {
    if (!VALID_STAGES.includes(stage as (typeof VALID_STAGES)[number])) {
      res.status(400).json({ error: `Invalid stage: ${stage}` });
      return;
    }
    filters.stage = stage as (typeof VALID_STAGES)[number];
  }
  if (search) filters.search = search;

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));

  try {
    const result = await listSentEmailLogs(filters, {
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
    });
    res.json({ ...result, page: pageNum, pageSize: pageSizeNum });
  } catch (err) {
    console.error('[sending-route] failed to list sent email logs:', err);
    res.status(500).json({ error: 'Failed to list sent email logs — see server logs for details' });
  }
});

/**
 * POST /api/sending/leads/:id/send-now — manual trigger for one sequence-stage send. This is
 * the only way to trigger a send in Phase 4 (no scheduler wired up yet — see
 * Docs/ARCHITECTURE.md § 6), which is itself the safety boundary against sending bulk volume:
 * there is no bulk-enqueue endpoint, only this one-lead-at-a-time trigger.
 */
sendingRouter.post('/leads/:id/send-now', async (req, res) => {
  const { stage } = (req.body ?? {}) as { stage?: unknown };

  if (typeof stage !== 'string' || !VALID_STAGES.includes(stage as (typeof VALID_STAGES)[number])) {
    res
      .status(400)
      .json({ error: `Request body must include "stage" as one of: ${VALID_STAGES.join(', ')}` });
    return;
  }

  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    await enqueueSendEmailJob({ leadId: lead.id, stage: stage as (typeof VALID_STAGES)[number] });
    res.status(202).json({ leadId: lead.id, stage, status: 'queued' });
  } catch (err) {
    console.error(`[sending-route] failed to enqueue send for lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to enqueue send — see server logs for details' });
  }
});

sendingRouter.get('/leads/:id/log', async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: `Lead not found: ${req.params.id}` });
      return;
    }

    const logs = await listSentEmailLogsForLead(lead.id);
    res.json(logs);
  } catch (err) {
    console.error(`[sending-route] failed to fetch send log for lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to fetch send log — see server logs for details' });
  }
});
