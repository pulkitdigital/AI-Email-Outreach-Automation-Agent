import type { EmailProviderName, SentEmailStatus } from '@bebeyond/shared';
import { pool } from '../pool.js';
import type { SendableStage } from './emailSequencesRepository.js';

export interface SentEmailLogRecord {
  id: string;
  leadId: string;
  emailSequenceId: string;
  categoryId: string | null;
  pitchDeckId: string | null;
  sequenceStage: SendableStage;
  providerName: EmailProviderName;
  externalMessageId: string | null;
  subject: string;
  bodySnapshot: string | null;
  status: SentEmailStatus;
  errorMessage: string | null;
  retryCount: number;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LOG_COLUMNS = `
  id, lead_id AS "leadId", email_sequence_id AS "emailSequenceId", category_id AS "categoryId",
  pitch_deck_id AS "pitchDeckId",
  sequence_stage AS "sequenceStage", provider_name AS "providerName",
  external_message_id AS "externalMessageId", subject, body_snapshot AS "bodySnapshot",
  status, error_message AS "errorMessage", retry_count AS "retryCount", sent_at AS "sentAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

/**
 * Every column explicitly qualified with `sel.` — for use only in queries that JOIN another
 * table. `leads` (joined below) also has its own `id`/`status`/`created_at`/`updated_at`
 * columns; reusing the bare `LOG_COLUMNS` constant here would make those references ambiguous
 * and fail at query time. Never reuse bare `LOG_COLUMNS` in a query that joins another table.
 */
const LOG_LIST_COLUMNS = `
  sel.id, sel.lead_id AS "leadId", sel.email_sequence_id AS "emailSequenceId",
  sel.category_id AS "categoryId", sel.pitch_deck_id AS "pitchDeckId",
  sel.sequence_stage AS "sequenceStage", sel.provider_name AS "providerName",
  sel.external_message_id AS "externalMessageId", sel.subject, sel.body_snapshot AS "bodySnapshot",
  sel.status, sel.error_message AS "errorMessage", sel.retry_count AS "retryCount",
  sel.sent_at AS "sentAt", sel.created_at AS "createdAt", sel.updated_at AS "updatedAt"
`;

export interface ClaimSendAttemptInput {
  leadId: string;
  emailSequenceId: string;
  categoryId: string | null;
  /** Snapshots which deck was attached at send time (stage 'new' only) — audit trail, same rationale as category_id. */
  pitchDeckId?: string | null;
  stage: SendableStage;
  providerName: EmailProviderName;
  subject: string;
}

export interface ClaimSendAttemptResult {
  id: string;
  /** True when this claim is re-attempting a prior failed send (retryCount already > 0 going in). */
  isRetry: boolean;
}

/**
 * The race-safety primitive the whole sending engine depends on: at most one caller — across
 * any number of concurrent workers/processes — may ever "win" the right to send a given
 * (lead, stage) email. Returns null when the caller should NOT send (already sent, or another
 * attempt is actively in flight right now).
 *
 * Mechanism:
 *  1. `INSERT ... ON CONFLICT (lead_id, sequence_stage) DO NOTHING RETURNING id` — Postgres's
 *     unique index guarantees exactly one concurrent INSERT can ever succeed for a given
 *     (lead_id, sequence_stage) pair; this is the DB-level guarantee, not an app-level check.
 *  2. On conflict (row already exists), lock it with `SELECT ... FOR UPDATE` inside a
 *     transaction. Only a row currently in 'failed' status is eligible for a legitimate retry
 *     (reset to 'queued', retry_count incremented, same row reused) — 'queued'/'sending' means
 *     another attempt is in flight right now (bail out); 'sent' means it's already done (bail
 *     out). The row lock means two concurrent "retry" claims can't both win either: the second
 *     blocks until the first commits, then sees the now-'queued' status and correctly backs off.
 */
export async function claimSendAttempt(
  input: ClaimSendAttemptInput,
): Promise<ClaimSendAttemptResult | null> {
  const insertResult = await pool.query(
    `INSERT INTO sent_emails_log (
       lead_id, email_sequence_id, category_id, pitch_deck_id, sequence_stage, provider_name, subject, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')
     ON CONFLICT (lead_id, sequence_stage) DO NOTHING
     RETURNING id`,
    [
      input.leadId,
      input.emailSequenceId,
      input.categoryId,
      input.pitchDeckId ?? null,
      input.stage,
      input.providerName,
      input.subject,
    ],
  );

  if (insertResult.rows[0]) {
    return { id: insertResult.rows[0].id as string, isRetry: false };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ id: string; status: SentEmailStatus }>(
      `SELECT id, status FROM sent_emails_log WHERE lead_id = $1 AND sequence_stage = $2 FOR UPDATE`,
      [input.leadId, input.stage],
    );
    const row = existing.rows[0];

    if (!row || row.status !== 'failed') {
      // Either genuinely gone (shouldn't happen — insert conflicted, so a row must exist), or
      // 'sent'/'queued'/'sending' — in every one of those cases, this caller must not send.
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE sent_emails_log SET status = 'queued', retry_count = retry_count + 1 WHERE id = $1`,
      [row.id],
    );
    await client.query('COMMIT');
    return { id: row.id, isRetry: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface MarkSendResultInput {
  status: SentEmailStatus;
  subject?: string | null;
  externalMessageId?: string | null;
  errorMessage?: string | null;
  bodySnapshot?: string | null;
  sentAt?: Date | null;
}

export async function markSendResult(id: string, patch: MarkSendResultInput): Promise<void> {
  await pool.query(
    `UPDATE sent_emails_log SET
       status = $2,
       subject = COALESCE($3, subject),
       external_message_id = COALESCE($4, external_message_id),
       error_message = $5,
       body_snapshot = COALESCE($6, body_snapshot),
       sent_at = COALESCE($7, sent_at)
     WHERE id = $1`,
    [
      id,
      patch.status,
      patch.subject ?? null,
      patch.externalMessageId ?? null,
      patch.errorMessage ?? null,
      patch.bodySnapshot ?? null,
      patch.sentAt ?? null,
    ],
  );
}

export async function getSentEmailLogById(id: string): Promise<SentEmailLogRecord | null> {
  const { rows } = await pool.query(`SELECT ${LOG_COLUMNS} FROM sent_emails_log WHERE id = $1`, [
    id,
  ]);
  return (rows[0] as SentEmailLogRecord | undefined) ?? null;
}

export async function listSentEmailLogsForLead(leadId: string): Promise<SentEmailLogRecord[]> {
  const { rows } = await pool.query(
    `SELECT ${LOG_COLUMNS} FROM sent_emails_log WHERE lead_id = $1 ORDER BY created_at ASC`,
    [leadId],
  );
  return rows as SentEmailLogRecord[];
}

/**
 * Subject line of a lead's already-SENT email for a given stage — used so 'followup'/'final'
 * emails continue the same thread ("Re: <original subject>") instead of composerService
 * inventing a new subject line for what a recipient will read as one ongoing conversation. Only
 * a 'sent' row counts (never a 'failed'/'cancelled'/'queued' one) since those never actually
 * reached the recipient's inbox and so started no real thread to continue.
 */
export async function getSentSubjectForStage(
  leadId: string,
  stage: SendableStage,
): Promise<string | null> {
  const { rows } = await pool.query<{ subject: string }>(
    `SELECT subject FROM sent_emails_log
     WHERE lead_id = $1 AND sequence_stage = $2 AND status = 'sent'
     LIMIT 1`,
    [leadId, stage],
  );
  return rows[0]?.subject ?? null;
}

/**
 * Defense in depth beyond the (lead_id, sequence_stage) claim above: confirms no OTHER lead
 * row sharing this normalized email has ever been sent anything. Under normal operation this
 * can never trigger — leads.email_normalized is UNIQUE, so two lead rows can't share an email
 * — but "never send to an address that has received any email from us, ever" is treated
 * literally here rather than assumed to hold from a constraint alone.
 */
export interface SentEmailLogListItem extends SentEmailLogRecord {
  leadEmail: string;
  companyName: string | null;
  categoryName: string | null;
}

export interface ListSentEmailLogsFilters {
  status?: SentEmailStatus;
  providerName?: EmailProviderName;
  categoryId?: string;
  stage?: SendableStage;
  /** Matched against the lead's email/company_name, case-insensitive substring. */
  search?: string;
}

export interface ListSentEmailLogsResult {
  logs: SentEmailLogListItem[];
  total: number;
}

/**
 * The dashboard's global sent-email-log table (Phase 6) — every send across every lead,
 * filterable/searchable/paginated. Genuinely new: sending.ts's existing GET .../leads/:id/log
 * only ever scoped to one lead. Joins leads (email/company) and categories (name) for display;
 * `COUNT(*) OVER()` gives the total matching-row count in the same query as the page fetched.
 */
export async function listSentEmailLogs(
  filters: ListSentEmailLogsFilters,
  pagination: { limit: number; offset: number },
): Promise<ListSentEmailLogsResult> {
  const conditions: string[] = ['1 = 1'];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`sel.status = $${values.length}`);
  }
  if (filters.providerName) {
    values.push(filters.providerName);
    conditions.push(`sel.provider_name = $${values.length}`);
  }
  if (filters.categoryId) {
    values.push(filters.categoryId);
    conditions.push(`sel.category_id = $${values.length}`);
  }
  if (filters.stage) {
    values.push(filters.stage);
    conditions.push(`sel.sequence_stage = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    const i = values.length;
    conditions.push(`(l.email ILIKE $${i} OR l.company_name ILIKE $${i})`);
  }

  values.push(pagination.limit);
  const limitIdx = values.length;
  values.push(pagination.offset);
  const offsetIdx = values.length;

  const { rows } = await pool.query(
    `SELECT ${LOG_LIST_COLUMNS}, l.email AS "leadEmail", l.company_name AS "companyName",
            c.name AS "categoryName", COUNT(*) OVER()::text AS "totalCount"
     FROM sent_emails_log sel
     JOIN leads l ON l.id = sel.lead_id
     LEFT JOIN categories c ON c.id = sel.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sel.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  const total = rows.length > 0 ? Number((rows[0] as { totalCount: string }).totalCount) : 0;
  const logs = rows.map((row) => {
    const { totalCount: _totalCount, ...log } = row as SentEmailLogListItem & {
      totalCount: string;
    };
    return log;
  });

  return { logs, total };
}

/**
 * Count of sends already claimed "today" (created_at falls within [dayStart, dayEnd)) —
 * feeds the Daily Scheduler's 300/day cap math. Counts every claimed attempt regardless of
 * eventual outcome (sent/failed/cancelled all still consumed a slot against the cap the moment
 * they were claimed), consistent with claimSendAttempt being the actual point of commitment.
 */
export async function countSentToday(dayStart: Date, dayEnd: Date): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sent_emails_log WHERE created_at >= $1 AND created_at < $2`,
    [dayStart, dayEnd],
  );
  return Number(rows[0]?.count ?? '0');
}

export interface ContactedSummary {
  sentCount: number;
  lastSentAt: Date | null;
}

/**
 * Aggregate of a lead's successful ('sent') sends — used by ingestion's already-contacted
 * visibility (see modules/ingestion/leadWriter.ts) once leadsRepository.upsertLead's cheap EXISTS
 * check has already established the lead has at least one, to fetch the detail (count, most
 * recent send) needed for ingestion_jobs.already_contacted_items.
 */
export async function getContactedSummaryForLead(leadId: string): Promise<ContactedSummary> {
  const { rows } = await pool.query<{ sentCount: string; lastSentAt: Date | null }>(
    `SELECT COUNT(*)::text AS "sentCount", MAX(sent_at) AS "lastSentAt"
     FROM sent_emails_log WHERE lead_id = $1 AND status = 'sent'`,
    [leadId],
  );
  return {
    sentCount: Number(rows[0]?.sentCount ?? '0'),
    lastSentAt: rows[0]?.lastSentAt ?? null,
  };
}

export async function findCrossLeadSendCollision(
  leadId: string,
  emailNormalized: string,
): Promise<{ otherLeadId: string; sentAt: Date | null } | null> {
  const { rows } = await pool.query<{ otherLeadId: string; sentAt: Date | null }>(
    `SELECT l.id AS "otherLeadId", sel.sent_at AS "sentAt"
     FROM sent_emails_log sel
     JOIN leads l ON l.id = sel.lead_id
     WHERE l.email_normalized = $1 AND l.id != $2
     LIMIT 1`,
    [emailNormalized, leadId],
  );
  return rows[0] ?? null;
}
