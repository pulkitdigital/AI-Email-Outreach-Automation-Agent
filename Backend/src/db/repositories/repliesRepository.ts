import type { EmailProviderName } from '@bebeyond/shared';
import { pool } from '../pool.js';

export interface ReplyRecord {
  id: string;
  leadId: string;
  emailSequenceId: string | null;
  sentEmailLogId: string | null;
  providerName: EmailProviderName;
  externalMessageId: string | null;
  fromEmail: string;
  subject: string | null;
  bodySnapshot: string | null;
  rawPayload: unknown;
  receivedAt: Date;
  createdAt: Date;
}

const REPLY_COLUMNS = `
  id, lead_id AS "leadId", email_sequence_id AS "emailSequenceId",
  sent_email_log_id AS "sentEmailLogId", provider_name AS "providerName",
  external_message_id AS "externalMessageId", from_email AS "fromEmail", subject,
  body_snapshot AS "bodySnapshot", raw_payload AS "rawPayload", received_at AS "receivedAt",
  created_at AS "createdAt"
`;

/**
 * Every column explicitly qualified with `r.` — for use only in queries that JOIN another
 * table. `leads` (joined below) also has its own `id`/`created_at` columns; reusing the bare
 * `REPLY_COLUMNS` constant here would make those references ambiguous and fail at query time.
 * Never reuse bare `REPLY_COLUMNS` in a query that joins another table.
 */
const REPLY_LIST_COLUMNS = `
  r.id, r.lead_id AS "leadId", r.email_sequence_id AS "emailSequenceId",
  r.sent_email_log_id AS "sentEmailLogId", r.provider_name AS "providerName",
  r.external_message_id AS "externalMessageId", r.from_email AS "fromEmail", r.subject,
  r.body_snapshot AS "bodySnapshot", r.raw_payload AS "rawPayload", r.received_at AS "receivedAt",
  r.created_at AS "createdAt"
`;

export interface RecordReplyInput {
  leadId: string;
  emailSequenceId: string | null;
  sentEmailLogId: string | null;
  providerName: EmailProviderName;
  externalMessageId?: string | null;
  fromEmail: string;
  subject?: string | null;
  bodySnapshot?: string | null;
  rawPayload: unknown;
  receivedAt: Date;
}

/**
 * Plain insert — replies is an append-only audit log (unlike sent_emails_log/email_sequences,
 * there's no "claim" concept here; a lead can legitimately reply more than once and each is
 * recorded). Idempotency against duplicate webhook delivery is handled one layer up in
 * replyTrackingService (which checks leads.status before acting on a reply), not here.
 */
export async function recordReply(input: RecordReplyInput): Promise<ReplyRecord> {
  const { rows } = await pool.query(
    `INSERT INTO replies (
       lead_id, email_sequence_id, sent_email_log_id, provider_name, external_message_id,
       from_email, subject, body_snapshot, raw_payload, received_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${REPLY_COLUMNS}`,
    [
      input.leadId,
      input.emailSequenceId,
      input.sentEmailLogId,
      input.providerName,
      input.externalMessageId ?? null,
      input.fromEmail,
      input.subject ?? null,
      input.bodySnapshot ?? null,
      JSON.stringify(input.rawPayload ?? {}),
      input.receivedAt,
    ],
  );
  return rows[0] as ReplyRecord;
}

/**
 * Guards against inserting a duplicate row when Brevo redelivers the same inbound webhook
 * (documented, common webhook behavior) — checked by the caller before recordReply() whenever
 * the payload carries an external_message_id.
 */
export async function findReplyByExternalMessageId(
  leadId: string,
  externalMessageId: string,
): Promise<ReplyRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${REPLY_COLUMNS} FROM replies WHERE lead_id = $1 AND external_message_id = $2 LIMIT 1`,
    [leadId, externalMessageId],
  );
  return (rows[0] as ReplyRecord | undefined) ?? null;
}

export async function listRepliesForLead(leadId: string): Promise<ReplyRecord[]> {
  const { rows } = await pool.query(
    `SELECT ${REPLY_COLUMNS} FROM replies WHERE lead_id = $1 ORDER BY received_at ASC`,
    [leadId],
  );
  return rows as ReplyRecord[];
}

export interface ReplyListItem extends ReplyRecord {
  leadEmail: string;
  companyName: string | null;
}

export interface ListRepliesFilters {
  /** Matched against the lead's email/company_name or the reply's subject, case-insensitive substring. */
  search?: string;
}

export interface ListRepliesResult {
  replies: ReplyListItem[];
  total: number;
}

/** The dashboard's global Replies view (Phase 6) — every reply across every lead, with readable content, searchable, paginated. */
export async function listReplies(
  filters: ListRepliesFilters,
  pagination: { limit: number; offset: number },
): Promise<ListRepliesResult> {
  const conditions: string[] = ['1 = 1'];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const i = values.length;
    conditions.push(`(l.email ILIKE $${i} OR l.company_name ILIKE $${i} OR r.subject ILIKE $${i})`);
  }

  values.push(pagination.limit);
  const limitIdx = values.length;
  values.push(pagination.offset);
  const offsetIdx = values.length;

  const { rows } = await pool.query(
    `SELECT ${REPLY_LIST_COLUMNS}, l.email AS "leadEmail",
            l.company_name AS "companyName", COUNT(*) OVER()::text AS "totalCount"
     FROM replies r
     JOIN leads l ON l.id = r.lead_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.received_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  const total = rows.length > 0 ? Number((rows[0] as { totalCount: string }).totalCount) : 0;
  const replies = rows.map((row) => {
    const { totalCount: _totalCount, ...reply } = row as ReplyListItem & { totalCount: string };
    return reply;
  });

  return { replies, total };
}
