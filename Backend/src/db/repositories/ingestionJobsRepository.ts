import type {
  IngestionFileError,
  IngestionReviewItem,
  IngestionSourceType,
} from '@bebeyond/shared';
import { pool } from '../pool.js';

export type IngestionJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

export interface IngestionJobRecord {
  id: string;
  sourceType: IngestionSourceType;
  sourceReference: string;
  storageKey: string | null;
  status: IngestionJobStatus;
  totalFilesDiscovered: number;
  filesProcessed: number;
  totalRowsFound: number;
  totalLeadsCreated: number;
  totalLeadsMerged: number;
  totalRowsFlaggedForReview: number;
  totalErrors: number;
  errorDetails: IngestionFileError[];
  reviewItems: IngestionReviewItem[];
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const JOB_COLUMNS = `
  id, source_type AS "sourceType", source_reference AS "sourceReference",
  storage_key AS "storageKey", status,
  total_files_discovered AS "totalFilesDiscovered", files_processed AS "filesProcessed",
  total_rows_found AS "totalRowsFound", total_leads_created AS "totalLeadsCreated",
  total_leads_merged AS "totalLeadsMerged",
  total_rows_flagged_for_review AS "totalRowsFlaggedForReview", total_errors AS "totalErrors",
  error_details AS "errorDetails", review_items AS "reviewItems",
  started_at AS "startedAt", completed_at AS "completedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export interface CreateIngestionJobInput {
  sourceType: IngestionSourceType;
  sourceReference: string;
  storageKey?: string | null;
}

export async function createIngestionJob(
  input: CreateIngestionJobInput,
): Promise<IngestionJobRecord> {
  const { rows } = await pool.query(
    `INSERT INTO ingestion_jobs (source_type, source_reference, storage_key)
     VALUES ($1, $2, $3)
     RETURNING ${JOB_COLUMNS}`,
    [input.sourceType, input.sourceReference, input.storageKey ?? null],
  );
  return rows[0] as IngestionJobRecord;
}

export async function getIngestionJobById(id: string): Promise<IngestionJobRecord | null> {
  const { rows } = await pool.query(`SELECT ${JOB_COLUMNS} FROM ingestion_jobs WHERE id = $1`, [
    id,
  ]);
  return (rows[0] as IngestionJobRecord | undefined) ?? null;
}

export async function listRecentIngestionJobs(
  limit = 50,
  statuses?: IngestionJobStatus[],
): Promise<IngestionJobRecord[]> {
  if (statuses && statuses.length > 0) {
    const { rows } = await pool.query(
      `SELECT ${JOB_COLUMNS} FROM ingestion_jobs WHERE status = ANY($2::text[]) ORDER BY created_at DESC LIMIT $1`,
      [limit, statuses],
    );
    return rows as IngestionJobRecord[];
  }

  const { rows } = await pool.query(
    `SELECT ${JOB_COLUMNS} FROM ingestion_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows as IngestionJobRecord[];
}

/** Exact count for the dashboard's System Status view (Phase 6) — kept separate from listRecentIngestionJobs so that endpoint's existing shape/behavior stays untouched. */
export async function countIngestionJobsByStatus(statuses: IngestionJobStatus[]): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ingestion_jobs WHERE status = ANY($1::text[])`,
    [statuses],
  );
  return Number(rows[0]?.count ?? '0');
}

export async function markIngestionJobStarted(
  id: string,
  totalFilesDiscovered: number,
): Promise<void> {
  await pool.query(
    `UPDATE ingestion_jobs
     SET status = 'processing', total_files_discovered = $2, started_at = now()
     WHERE id = $1`,
    [id, totalFilesDiscovered],
  );
}

/**
 * Zeroes all progress counters/logs and resets status to 'pending'. Called at the start of
 * every worker attempt (including BullMQ retries) so a retried job reports accurate progress
 * instead of double-counting on top of a partial first attempt. The leads it already wrote
 * are untouched and don't need resetting — upsertLead is idempotent, so re-processing the same
 * source data on retry is safe.
 */
export async function resetIngestionJobCounters(id: string): Promise<void> {
  await pool.query(
    `UPDATE ingestion_jobs SET
       total_files_discovered = 0, files_processed = 0, total_rows_found = 0,
       total_leads_created = 0, total_leads_merged = 0, total_rows_flagged_for_review = 0,
       total_errors = 0, error_details = '[]'::jsonb, review_items = '[]'::jsonb,
       status = 'pending', started_at = NULL, completed_at = NULL
     WHERE id = $1`,
    [id],
  );
}

export interface IngestionJobCounterDeltas {
  totalFilesDiscovered?: number;
  filesProcessed?: number;
  totalRowsFound?: number;
  totalLeadsCreated?: number;
  totalLeadsMerged?: number;
  totalRowsFlaggedForReview?: number;
  totalErrors?: number;
}

const COUNTER_COLUMN_BY_KEY: Record<keyof IngestionJobCounterDeltas, string> = {
  totalFilesDiscovered: 'total_files_discovered',
  filesProcessed: 'files_processed',
  totalRowsFound: 'total_rows_found',
  totalLeadsCreated: 'total_leads_created',
  totalLeadsMerged: 'total_leads_merged',
  totalRowsFlaggedForReview: 'total_rows_flagged_for_review',
  totalErrors: 'total_errors',
};

/** Atomic `column = column + delta` update — safe under concurrent writers, no read-modify-write race. */
export async function incrementIngestionJobCounters(
  id: string,
  deltas: IngestionJobCounterDeltas,
): Promise<void> {
  const entries = Object.entries(deltas).filter(([, v]) => v !== undefined && v !== 0);
  if (entries.length === 0) return;

  const setClauses = entries.map(
    ([key], i) =>
      `${COUNTER_COLUMN_BY_KEY[key as keyof IngestionJobCounterDeltas]} = ${COUNTER_COLUMN_BY_KEY[key as keyof IngestionJobCounterDeltas]} + $${i + 2}`,
  );
  const values = entries.map(([, v]) => v);

  await pool.query(`UPDATE ingestion_jobs SET ${setClauses.join(', ')} WHERE id = $1`, [
    id,
    ...values,
  ]);
}

/** Appends one entry to ingestion_jobs.error_details (file/row parse failures that didn't stop the batch). */
export async function appendIngestionJobError(
  id: string,
  error: IngestionFileError,
): Promise<void> {
  await pool.query(
    `UPDATE ingestion_jobs SET error_details = error_details || $2::jsonb WHERE id = $1`,
    [id, JSON.stringify([error])],
  );
}

/** Appends one entry to ingestion_jobs.review_items (extracted content with no confident email — no lead row exists to flag instead). */
export async function appendIngestionJobReviewItem(
  id: string,
  item: IngestionReviewItem,
): Promise<void> {
  await pool.query(
    `UPDATE ingestion_jobs SET review_items = review_items || $2::jsonb WHERE id = $1`,
    [id, JSON.stringify([item])],
  );
}

export async function completeIngestionJob(
  id: string,
  status: Extract<IngestionJobStatus, 'completed' | 'failed' | 'partial'>,
): Promise<void> {
  await pool.query(`UPDATE ingestion_jobs SET status = $2, completed_at = now() WHERE id = $1`, [
    id,
    status,
  ]);
}
