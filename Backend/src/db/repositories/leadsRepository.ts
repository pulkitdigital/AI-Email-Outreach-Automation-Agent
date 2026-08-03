import type {
  CategorizationMethod,
  LeadReviewReason,
  LeadStatus,
  SequenceStage,
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
  reviewReason: LeadReviewReason | null;
  extractionConfidence: number | null;
  rawData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const LEAD_COLUMNS = `
  id, email, email_normalized AS "emailNormalized",
  company_name AS "companyName", contact_name AS "contactName", phone, website, industry,
  country, region, ingestion_job_id AS "ingestionJobId", source_file AS "sourceFile",
  category_id AS "categoryId", categorization_method AS "categorizationMethod",
  categorization_confidence AS "categorizationConfidence",
  status, review_reason AS "reviewReason",
  extraction_confidence AS "extractionConfidence", raw_data AS "rawData",
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
      return { record: insertResult.rows[0] as LeadRecord, wasCreated: true, mergedFields: [] };
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
      return { record: retryInsert.rows[0] as LeadRecord, wasCreated: true, mergedFields: [] };
    }

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
      return { record: existing, wasCreated: false, mergedFields: [] };
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
    return { record: updated.rows[0] as LeadRecord, wasCreated: false, mergedFields };
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
  l.status, l.review_reason AS "reviewReason",
  l.extraction_confidence AS "extractionConfidence", l.raw_data AS "rawData",
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
     RETURNING ${LEAD_COLUMNS}`,
    [id, status, reviewReason === undefined, reviewReason ?? null],
  );
  return (rows[0] as LeadRecord | undefined) ?? null;
}
