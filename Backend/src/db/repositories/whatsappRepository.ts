import type {
  WhatsAppConversationCategory,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  WhatsAppOptInSource,
  WhatsAppTemplateApprovalStatus,
} from '@bebeyond/shared';
import { pool } from '../pool.js';

/**
 * The minimal, always-fresh slice of a lead's WhatsApp state — deliberately NOT the full
 * LeadRecord. Callers (whatsappService) must fetch this immediately before every send rather
 * than reusing a lead object loaded earlier in the request, so a stale in-memory opt-in flag can
 * never cause an accidental send — see getLeadWhatsAppState's docstring.
 */
export interface LeadWhatsAppState {
  id: string;
  whatsappNumber: string | null;
  whatsappOptedIn: boolean;
  whatsappOptInSource: WhatsAppOptInSource | null;
  whatsappOptInAt: Date | null;
  whatsappLastInboundAt: Date | null;
}

const LEAD_WHATSAPP_STATE_COLUMNS = `
  id, whatsapp_number AS "whatsappNumber", whatsapp_opted_in AS "whatsappOptedIn",
  whatsapp_opt_in_source AS "whatsappOptInSource", whatsapp_opt_in_at AS "whatsappOptInAt",
  whatsapp_last_inbound_at AS "whatsappLastInboundAt"
`;

/**
 * THE fresh read every send path must use — see whatsappService.ts's sendWhatsAppTemplateMessage
 * / sendWhatsAppFreeformMessage, which call this immediately before invoking the provider and
 * abort if whatsappOptedIn is false. Never reuse a LeadRecord fetched earlier in the same request
 * for this check: the whole point is protecting against stale state (e.g. a lead opted out via a
 * different admin action milliseconds after a request loaded its lead object).
 */
export async function getLeadWhatsAppState(leadId: string): Promise<LeadWhatsAppState | null> {
  const { rows } = await pool.query(
    `SELECT ${LEAD_WHATSAPP_STATE_COLUMNS} FROM leads WHERE id = $1`,
    [leadId],
  );
  return (rows[0] as LeadWhatsAppState | undefined) ?? null;
}

export async function findLeadIdByWhatsAppNumber(phoneNumber: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM leads WHERE whatsapp_number = $1 LIMIT 1`,
    [phoneNumber],
  );
  return rows[0]?.id ?? null;
}

/**
 * Fallback match for an inbound message whose sender number was never explicitly recorded as
 * whatsapp_number — compares against the lead's `phone` field. Matches on the last 10 digits
 * (a full national significant number) after stripping all non-digit characters, since ingested
 * `phone` values are free-text (spaces, dashes, +country-code, or no country code at all) while
 * WhatsApp's `from` is always E.164 digits-only — an exact string match would miss almost every
 * real lead. 10 digits is deliberately conservative (India's national number length) to avoid
 * matching unrelated leads on a short/shared prefix.
 */
export async function findLeadIdByPhoneSuffix(last10Digits: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM leads
     WHERE phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
     LIMIT 1`,
    [last10Digits],
  );
  return rows[0]?.id ?? null;
}

/**
 * The ONLY way whatsapp_opted_in can become true — see shared/src/types/whatsapp.ts's
 * WhatsAppOptInSource. Always (re)sets whatsapp_number to the number the opt-in came from, since
 * a reply-offer/manual opt-in is exactly how a lead's WhatsApp number gets recorded in the first
 * place (there's no separate "add number" action).
 */
export async function optInLeadForWhatsApp(
  leadId: string,
  phoneNumber: string,
  source: WhatsAppOptInSource,
): Promise<LeadWhatsAppState | null> {
  const { rows } = await pool.query(
    `UPDATE leads SET
       whatsapp_number = $2,
       whatsapp_opted_in = true,
       whatsapp_opt_in_source = $3,
       whatsapp_opt_in_at = now()
     WHERE id = $1
     RETURNING ${LEAD_WHATSAPP_STATE_COLUMNS}`,
    [leadId, phoneNumber, source],
  );
  return (rows[0] as LeadWhatsAppState | undefined) ?? null;
}

/** Re-opens the 24h freeform window — called on every inbound message, regardless of whether it was also the opt-in trigger. */
export async function recordWhatsAppInboundTimestamp(
  leadId: string,
  receivedAt: Date,
): Promise<void> {
  await pool.query(`UPDATE leads SET whatsapp_last_inbound_at = $2 WHERE id = $1`, [
    leadId,
    receivedAt,
  ]);
}

export interface LogWhatsAppMessageInput {
  /** NULL for an inbound message from an unmatched phone number — see routes/webhooks.ts. */
  leadId: string | null;
  direction: WhatsAppMessageDirection;
  messageType: WhatsAppMessageType;
  templateName?: string | null;
  fromPhoneNumber?: string | null;
  bodyPreview?: string | null;
  metaMessageId?: string | null;
  conversationCategory?: WhatsAppConversationCategory | null;
  status: WhatsAppMessageStatus;
  errorMessage?: string | null;
  rawPayload?: unknown;
}

export interface WhatsAppMessageLogRecord {
  id: string;
  leadId: string | null;
  direction: WhatsAppMessageDirection;
  messageType: WhatsAppMessageType;
  templateName: string | null;
  fromPhoneNumber: string | null;
  bodyPreview: string | null;
  metaMessageId: string | null;
  conversationCategory: WhatsAppConversationCategory | null;
  status: WhatsAppMessageStatus;
  errorMessage: string | null;
  rawPayload: unknown;
  createdAt: Date;
}

const MESSAGE_LOG_COLUMNS = `
  id, lead_id AS "leadId", direction, message_type AS "messageType",
  template_name AS "templateName", from_phone_number AS "fromPhoneNumber",
  body_preview AS "bodyPreview", meta_message_id AS "metaMessageId",
  conversation_category AS "conversationCategory", status, error_message AS "errorMessage",
  raw_payload AS "rawPayload", created_at AS "createdAt"
`;

/** Append-only audit log — every inbound and outbound WhatsApp message, matched or not, successful or not. */
export async function logWhatsAppMessage(
  input: LogWhatsAppMessageInput,
): Promise<WhatsAppMessageLogRecord> {
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_messages_log (
       lead_id, direction, message_type, template_name, from_phone_number, body_preview,
       meta_message_id, conversation_category, status, error_message, raw_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${MESSAGE_LOG_COLUMNS}`,
    [
      input.leadId,
      input.direction,
      input.messageType,
      input.templateName ?? null,
      input.fromPhoneNumber ?? null,
      input.bodyPreview ?? null,
      input.metaMessageId ?? null,
      input.conversationCategory ?? null,
      input.status,
      input.errorMessage ?? null,
      JSON.stringify(input.rawPayload ?? {}),
    ],
  );
  return rows[0] as WhatsAppMessageLogRecord;
}

/** Every column explicitly qualified with `w.` — for use only in the joined listWhatsAppMessages query (joins `leads`, which also has its own `id`/`created_at`). Never reuse the bare MESSAGE_LOG_COLUMNS in a query that joins another table — see REPLY_LIST_COLUMNS in repliesRepository.ts for the same precedent. */
const MESSAGE_LOG_LIST_COLUMNS = `
  w.id, w.lead_id AS "leadId", w.direction, w.message_type AS "messageType",
  w.template_name AS "templateName", w.from_phone_number AS "fromPhoneNumber",
  w.body_preview AS "bodyPreview", w.meta_message_id AS "metaMessageId",
  w.conversation_category AS "conversationCategory", w.status, w.error_message AS "errorMessage",
  w.raw_payload AS "rawPayload", w.created_at AS "createdAt"
`;

export async function findWhatsAppMessageByMetaId(
  metaMessageId: string,
): Promise<WhatsAppMessageLogRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_LOG_COLUMNS} FROM whatsapp_messages_log WHERE meta_message_id = $1 LIMIT 1`,
    [metaMessageId],
  );
  return (rows[0] as WhatsAppMessageLogRecord | undefined) ?? null;
}

export interface WhatsAppMessageListItem extends WhatsAppMessageLogRecord {
  leadEmail: string | null;
  companyName: string | null;
  leadOptedIn: boolean | null;
}

export interface ListWhatsAppMessagesFilters {
  /** true = only messages matched to a lead, false = only unmatched (lead_id IS NULL), undefined = both. */
  matched?: boolean;
  /** true = only leads currently opted in, false = only leads not opted in, undefined = both. Ignored for unmatched rows (no lead to check). */
  optedIn?: boolean;
}

export interface ListWhatsAppMessagesResult {
  messages: WhatsAppMessageListItem[];
  total: number;
}

/** The dashboard's WhatsApp section (mirrors listReplies) — every logged message, filterable by matched/unmatched and opted-in/not, paginated. */
export async function listWhatsAppMessages(
  filters: ListWhatsAppMessagesFilters,
  pagination: { limit: number; offset: number },
): Promise<ListWhatsAppMessagesResult> {
  const conditions: string[] = ['1 = 1'];
  const values: unknown[] = [];

  if (filters.matched === true) {
    conditions.push('w.lead_id IS NOT NULL');
  } else if (filters.matched === false) {
    conditions.push('w.lead_id IS NULL');
  }

  if (filters.optedIn !== undefined) {
    values.push(filters.optedIn);
    conditions.push(`l.whatsapp_opted_in = $${values.length}`);
  }

  values.push(pagination.limit);
  const limitIdx = values.length;
  values.push(pagination.offset);
  const offsetIdx = values.length;

  const { rows } = await pool.query(
    `SELECT ${MESSAGE_LOG_LIST_COLUMNS},
            l.email AS "leadEmail", l.company_name AS "companyName", l.whatsapp_opted_in AS "leadOptedIn",
            COUNT(*) OVER()::text AS "totalCount"
     FROM whatsapp_messages_log w
     LEFT JOIN leads l ON l.id = w.lead_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY w.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  const total = rows.length > 0 ? Number((rows[0] as { totalCount: string }).totalCount) : 0;
  const messages = rows.map((row) => {
    const { totalCount: _totalCount, ...message } = row as WhatsAppMessageListItem & {
      totalCount: string;
    };
    return message;
  });

  return { messages, total };
}

export interface WhatsAppTemplateRecord {
  id: string;
  name: string;
  metaTemplateId: string | null;
  language: string;
  category: WhatsAppConversationCategory | null;
  approvalStatus: WhatsAppTemplateApprovalStatus;
  variables: unknown;
  createdAt: Date;
}

const TEMPLATE_COLUMNS = `
  id, name, meta_template_id AS "metaTemplateId", language, category,
  approval_status AS "approvalStatus", variables, created_at AS "createdAt"
`;

/**
 * Mirrors Meta Business Manager's template state (see the whatsapp_templates table's own
 * docstring in migrations/0008_whatsapp_channel.sql) — this never creates/edits a template on
 * Meta's side, it only reads what's been recorded here for the dashboard's template-send picker.
 * Only 'approved' templates are ever offered for an actual send (outside the 24h freeform
 * window, Meta rejects anything else) — see Frontend's lead detail WhatsApp send box.
 */
export async function listWhatsAppTemplates(
  filters: { approvalStatus?: WhatsAppTemplateApprovalStatus } = {},
): Promise<WhatsAppTemplateRecord[]> {
  const conditions: string[] = ['1 = 1'];
  const values: unknown[] = [];

  if (filters.approvalStatus) {
    values.push(filters.approvalStatus);
    conditions.push(`approval_status = $${values.length}`);
  }

  const { rows } = await pool.query(
    `SELECT ${TEMPLATE_COLUMNS} FROM whatsapp_templates WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
    values,
  );
  return rows as WhatsAppTemplateRecord[];
}
