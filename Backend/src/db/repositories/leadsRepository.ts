import {
  PROTECTED_TERMINAL_STATUSES,
  type CategorizationMethod,
  type LeadReviewReason,
  type LeadStatus,
  type SequenceStage,
  type WhatsAppOptInSource,
} from '@bebeyond/shared';
import { pool } from '../pool.js';
import { computeMergePatch, type MergeableLeadFields } from '../../modules/ingestion/normalize.js';

export interface LeadRecord extends MergeableLeadFields {
  id: string;
  email: string;
  emailNormalized: string;
  ingestionJobId: string | null;
  sourceFile: string | null;
  categoryId: string | null;
  categorizationMethod: CategorizationMethod | null;
  categorizationConfidence: number | null;
  status: LeadStatus;
  statusManuallySet: boolean;
  reviewReason: LeadReviewReason | null;
  extractionConfidence: number | null;
  rawData: Record<string, unknown>;
  deletedAt: Date | null;
  whatsappNumber: string | null;
  whatsappOptedIn: boolean;
  whatsappOptInSource: WhatsAppOptInSource | null;
  whatsappOptInAt: Date | null;
  whatsappLastInboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LEAD_COLUMNS = `
  id, email, email_normalized AS "emailNormalized",
  company_name AS "companyName", contact_name AS "contactName", phone, website, industry,
  country, region, ingestion_job_id AS "ingestionJobId", source_file AS "sourceFile",
  category_id AS "categoryId", categorization_method AS "categorizationMethod",
  categorization_confidence AS "categorizationConfidence",
  status, status_manually_set AS "statusManuallySet", review_reason AS "reviewReason",
  extraction_confidence AS "extractionConfidence", raw_data AS "rawData",
  deleted_at AS "deletedAt",
  whatsapp_number AS "whatsappNumber", whatsapp_opted_in AS "whatsappOptedIn",
  whatsapp_opt_in_source AS "whatsappOptInSource", whatsapp_opt_in_at AS "whatsappOptInAt",
  whatsapp_last_inbound_at AS "whatsappLastInboundAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export interface UpsertLeadInput {
  email: string;
  emailNormalized: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  region?: string | null;
  ingestionJobId: string;
  sourceFile: string;
  rawData: Record<string, unknown>;
  status: LeadStatus;
  reviewReason?: LeadReviewReason | null;
  extractionConfidence?: number | null;
}

export interface UpsertLeadResult {
  record: LeadRecord;
  wasCreated: boolean;
  mergedFields: string[];
  /** True when this row matched an existing lead that has already been sent at least one email (status = 'sent'). Always false for a brand-new lead. */
  alreadyContacted: boolean;
}

/**
 * Insert-or-merge a lead by normalized email, atomically and race-safely:
 *  1. Try a plain insert; ON CONFLICT DO NOTHING means a concurrent duplicate never errors.
 *  2. On conflict, lock the existing row (SELECT ... FOR UPDATE) inside the same transaction,
 *     compute the merge patch with the same pure function the unit tests exercise, and apply
 *     only the fields that were blank on the existing row. Existing non-blank data is never
 *     overwritten — see Docs/DATABASE_SCHEMA.md § leads and normalize.ts.
 */
export async function upsertLead(input: UpsertLeadInput): Promise<UpsertLeadResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO leads (
         email, email_normalized, company_name, contact_name, phone, website, industry,
         country, region, ingestion_job_id, source_file, raw_data, status, review_reason,
         extraction_confidence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (email_normalized) DO NOTHING
       RETURNING ${LEAD_COLUMNS}`,
      [
        input.email,
        input.emailNormalized,
        input.companyName ?? null,
        input.contactName ?? null,
        input.phone ?? null,
        input.website ?? null,
        input.industry ?? null,
        input.country ?? null,
        input.region ?? null,
        input.ingestionJobId,
        input.sourceFile,
        JSON.stringify(input.rawData ?? {}),
        input.status,
        input.reviewReason ?? null,
        input.extractionConfidence ?? null,
      ],
    );

    if (insertResult.rows[0]) {
      await client.query('COMMIT');
      return {
        record: insertResult.rows[0] as LeadRecord,
        wasCreated: true,
        mergedFields: [],
        alreadyContacted: false,
      };
    }

    const existingResult = await client.query(
      `SELECT ${LEAD_COLUMNS} FROM leads WHERE email_normalized = $1 FOR UPDATE`,
      [input.emailNormalized],
    );
    const existing = existingResult.rows[0] as LeadRecord | undefined;

    if (!existing) {
      // Row existed at conflict time but is gone now (hard-deleted out of band) — extremely
      // unlikely given leads are soft-deleted only, but don't silently drop the lead: retry as
      // a fresh insert within the same transaction.
      const retryInsert = await client.query(
        `INSERT INTO leads (
           email, email_normalized, company_name, contact_name, phone, website, industry,
           country, region, ingestion_job_id, source_file, raw_data, status, review_reason,
           extraction_confidence
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING ${LEAD_COLUMNS}`,
        [
          input.email,
          input.emailNormalized,
          input.companyName ?? null,
          input.contactName ?? null,
          input.phone ?? null,
          input.website ?? null,
          input.industry ?? null,
          input.country ?? null,
          input.region ?? null,
          input.ingestionJobId,
          input.sourceFile,
          JSON.stringify(input.rawData ?? {}),
          input.status,
          input.reviewReason ?? null,
          input.extractionConfidence ?? null,
        ],
      );
      await client.query('COMMIT');
      return {
        record: retryInsert.rows[0] as LeadRecord,
        wasCreated: true,
        mergedFields: [],
        alreadyContacted: false,
      };
    }

    // Cheap existence check, not a join — sub-classifies this matched duplicate as "already
    // contacted" (see ingestion_jobs.total_leads_already_contacted) for both the merged and
    // unchanged-duplicate cases below.
    const contactedResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM sent_emails_log WHERE lead_id = $1 AND status = 'sent') AS exists`,
      [existing.id],
    );
    const alreadyContacted = contactedResult.rows[0]?.exists ?? false;

    const patch = computeMergePatch(existing, {
      companyName: input.companyName,
      contactName: input.contactName,
      phone: input.phone,
      website: input.website,
      industry: input.industry,
      country: input.country,
      region: input.region,
    });
    const mergedFields = Object.keys(patch);

    if (mergedFields.length === 0) {
      await client.query('COMMIT');
      return { record: existing, wasCreated: false, mergedFields: [], alreadyContacted };
    }

    const columnByField: Record<string, string> = {
      companyName: 'company_name',
      contactName: 'contact_name',
      phone: 'phone',
      website: 'website',
      industry: 'industry',
      country: 'country',
      region: 'region',
    };
    const setClauses = mergedFields.map((field, i) => `${columnByField[field]} = $${i + 2}`);
    const values = mergedFields.map((field) => (patch as Record<string, string>)[field]);

    const updated = await client.query(
      `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $1 RETURNING ${LEAD_COLUMNS}`,
      [existing.id, ...values],
    );

    await client.query('COMMIT');
    return { record: updated.rows[0] as LeadRecord, wasCreated: false, mergedFields, alreadyContacted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findLeadByNormalizedEmail(
  emailNormalized: string,
): Promise<LeadRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${LEAD_COLUMNS} FROM leads WHERE email_normalized = $1 AND deleted_at IS NULL`,
    [emailNormalized],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  const { rows } = await pool.query(`SELECT ${LEAD_COLUMNS} FROM leads WHERE id = $1`, [id]);
  return (rows[0] as LeadRecord | undefined) ?? null;
}

/** Bounded id listing for bulk operations (e.g. recategorize-by-status) — never an unbounded table scan. */
export async function listLeadIdsByStatus(status: LeadStatus, limit = 5000): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM leads WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT $2`,
    [status, limit],
  );
  return rows.map((r) => r.id);
}

export interface LeadListItem extends LeadRecord {
  categoryName: string | null;
  sequenceStage: SequenceStage | null;
}

/**
 * Every column explicitly qualified with `l.` — `categories` and `email_sequences` (joined
 * below) both also have their own `id`/`created_at`/`updated_at` columns, and `LEAD_COLUMNS`'s
 * bare names would resolve ambiguously across the join (Postgres errors at query time on an
 * unqualified column present in more than one joined table). Never reuse the bare `LEAD_COLUMNS`
 * constant in a query that joins another table with overlapping column names.
 */
const LEAD_LIST_COLUMNS = `
  l.id, l.email, l.email_normalized AS "emailNormalized",
  l.company_name AS "companyName", l.contact_name AS "contactName", l.phone, l.website, l.industry,
  l.country, l.region, l.ingestion_job_id AS "ingestionJobId", l.source_file AS "sourceFile",
  l.category_id AS "categoryId", l.categorization_method AS "categorizationMethod",
  l.categorization_confidence AS "categorizationConfidence",
  l.status, l.status_manually_set AS "statusManuallySet", l.review_reason AS "reviewReason",
  l.extraction_confidence AS "extractionConfidence", l.raw_data AS "rawData",
  l.deleted_at AS "deletedAt",
  l.whatsapp_number AS "whatsappNumber", l.whatsapp_opted_in AS "whatsappOptedIn",
  l.whatsapp_opt_in_source AS "whatsappOptInSource", l.whatsapp_opt_in_at AS "whatsappOptInAt",
  l.whatsapp_last_inbound_at AS "whatsappLastInboundAt",
  l.created_at AS "createdAt", l.updated_at AS "updatedAt"
`;

export interface ListLeadsFilters {
  status?: LeadStatus;
  categoryId?: string;
  sequenceStage?: SequenceStage;
  /** Matched against email/company_name/contact_name, case-insensitive substring. */
  search?: string;
}

export interface ListLeadsResult {
  leads: LeadListItem[];
  total: number;
}

/**
 * The dashboard's main leads table (Phase 6) — filterable by status/category/sequence stage,
 * searchable, paginated. Joins categories (name) and email_sequences (current_stage) since the
 * dashboard needs both without a second round-trip per row. `COUNT(*) OVER()` gives the total
 * matching-row count in the same query as the page of results, rather than a separate COUNT(*)
 * query that could race against concurrent writes and disagree with the page just fetched.
 */
export async function listLeads(
  filters: ListLeadsFilters,
  pagination: { limit: number; offset: number },
): Promise<ListLeadsResult> {
  const conditions: string[] = ['l.deleted_at IS NULL'];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`l.status = $${values.length}`);
  }
  if (filters.categoryId) {
    values.push(filters.categoryId);
    conditions.push(`l.category_id = $${values.length}`);
  }
  if (filters.sequenceStage) {
    values.push(filters.sequenceStage);
    conditions.push(`es.current_stage = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    const i = values.length;
    conditions.push(
      `(l.email ILIKE $${i} OR l.company_name ILIKE $${i} OR l.contact_name ILIKE $${i})`,
    );
  }

  values.push(pagination.limit);
  const limitIdx = values.length;
  values.push(pagination.offset);
  const offsetIdx = values.length;

  const { rows } = await pool.query(
    `SELECT ${LEAD_LIST_COLUMNS}, c.name AS "categoryName", es.current_stage AS "sequenceStage",
            COUNT(*) OVER()::text AS "totalCount"
     FROM leads l
     LEFT JOIN categories c ON c.id = l.category_id
     LEFT JOIN email_sequences es ON es.lead_id = l.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  const total = rows.length > 0 ? Number((rows[0] as { totalCount: string }).totalCount) : 0;
  const leads = rows.map((row) => {
    const { totalCount: _totalCount, ...lead } = row as LeadListItem & { totalCount: string };
    return lead;
  });

  return { leads, total };
}

/**
 * Inline edit support (Phase 6 dashboard "needs review" queue) — the same free-text profile
 * fields ingestion's own merge logic treats as editable (see modules/ingestion/normalize.ts's
 * MERGEABLE_LEAD_FIELDS), now editable by a human confirming/fixing a low-confidence extraction.
 * Never touches status/category/raw_data — those have their own dedicated transition functions.
 */
export async function updateLeadFields(
  id: string,
  patch: Partial<MergeableLeadFields>,
): Promise<LeadRecord | null> {
  const columnByField: Record<keyof MergeableLeadFields, string> = {
    companyName: 'company_name',
    contactName: 'contact_name',
    phone: 'phone',
    website: 'website',
    industry: 'industry',
    country: 'country',
    region: 'region',
  };

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return getLeadById(id);
  }

  const setClauses = entries.map(
    ([field], i) => `${columnByField[field as keyof MergeableLeadFields]} = $${i + 2}`,
  );
  const values = entries.map(([, v]) => v);

  const { rows } = await pool.query(
    `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $1 RETURNING ${LEAD_COLUMNS}`,
    [id, ...values],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}

export interface LeadCategorizationPatch {
  categoryId: string | null;
  categorizationMethod: CategorizationMethod | null;
  categorizationConfidence: number | null;
  status: LeadStatus;
  reviewReason: LeadReviewReason | null;
}

/** Applies the outcome of a categorization run to a lead's own columns (primary category only — secondaries live in lead_secondary_categories). */
export async function updateLeadCategorization(
  id: string,
  patch: LeadCategorizationPatch,
): Promise<LeadRecord | null> {
  const { rows } = await pool.query(
    `UPDATE leads SET
       category_id = $2,
       categorization_method = $3,
       categorization_confidence = $4,
       status = $5,
       review_reason = $6
     WHERE id = $1
     RETURNING ${LEAD_COLUMNS}`,
    [
      id,
      patch.categoryId,
      patch.categorizationMethod,
      patch.categorizationConfidence,
      patch.status,
      patch.reviewReason,
    ],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}

/**
 * Generic status (+ optional review reason) update, used by layers that don't touch
 * categorization fields at all — e.g. deck generation moving 'categorized' -> 'deck_generated',
 * or flagging 'needs_review' on an exhausted-retries deck failure. Pass reviewReason
 * explicitly (including null to clear it); omitting it leaves the existing value untouched.
 *
 * Every caller of this function is an automated pipeline (deck generation, sending engine, reply
 * tracking, unsubscribe) — never the dashboard's manual status-change action, which goes through
 * setLeadStatusManually instead. So the WHERE clause guards against exactly one thing: silently
 * overwriting a status a human deliberately set to one of PROTECTED_TERMINAL_STATUSES. When
 * blocked, this resolves to a no-op (returns null) rather than an error — a failed-to-advance
 * status is not a failure the caller needs to react to.
 */
export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
  reviewReason?: LeadReviewReason | null,
): Promise<LeadRecord | null> {
  const { rows } = await pool.query(
    `UPDATE leads SET
       status = $2,
       review_reason = CASE WHEN $3 THEN review_reason ELSE $4 END
     WHERE id = $1
       AND NOT (status_manually_set AND status = ANY($5::text[]))
     RETURNING ${LEAD_COLUMNS}`,
    [id, status, reviewReason === undefined, reviewReason ?? null, PROTECTED_TERMINAL_STATUSES],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}

/**
 * The dashboard's manual status-change action (PATCH /api/leads/:id/status) — a human explicitly
 * choosing a status always wins, unlike updateLeadStatus's automation callers, so there's no
 * protected-status guard here. Clears review_reason (a human resolving the status has resolved
 * whatever review reason was pending) and sets status_manually_set so updateLeadStatus knows not
 * to silently overwrite this choice later if it lands on a protected terminal status.
 */
export async function setLeadStatusManually(
  id: string,
  status: LeadStatus,
): Promise<LeadRecord | null> {
  const { rows } = await pool.query(
    `UPDATE leads SET status = $2, status_manually_set = true, review_reason = NULL
     WHERE id = $1
     RETURNING ${LEAD_COLUMNS}`,
    [id, status],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}

/**
 * Permanently removes a lead row (dashboard's per-row "Delete" action). pitch_decks,
 * email_sequences, sent_emails_log, replies, and lead_secondary_categories all reference leads
 * with ON DELETE CASCADE (see Backend/src/db/migrations/0001_init.sql / 0002_categorization.sql),
 * so this single DELETE lets Postgres remove every related row atomically — no manual multi-table
 * deletes or a new migration needed, the schema was already built for this. whatsapp_messages_log
 * instead has ON DELETE SET NULL (0008_whatsapp_channel.sql) and survives, unlinked, as a
 * message-history audit trail, same as ingestion_jobs (leads.ingestion_job_id → SET NULL, the
 * other direction). Deliberately hard, not soft: a lead is deleted specifically so a later
 * re-ingestion of the same email is treated as brand new (see upsertLead's
 * UNIQUE(email_normalized) conflict path) rather than merging into a dead row — soft-deleting
 * couldn't achieve that, since the UNIQUE constraint still held the email regardless of
 * deleted_at. Callers must delete any R2-stored deck files BEFORE calling this (the pitch_decks
 * rows, and their file_key/pdf_file_key pointers, are gone the moment this returns) — see
 * modules/leads/leadDeletionService.ts, the only intended caller.
 */
export async function hardDeleteLead(id: string): Promise<LeadRecord | null> {
  const { rows } = await pool.query(
    `DELETE FROM leads WHERE id = $1 RETURNING ${LEAD_COLUMNS}`,
    [id],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}
