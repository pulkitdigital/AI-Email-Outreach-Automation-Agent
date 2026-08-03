import type { IngestionSourceType, LeadReviewReason } from './lead.js';

/**
 * Fields a parser can populate for a single candidate lead row, before normalization/dedup.
 * All optional except email — a row with no email is not a lead candidate at all (leads.email
 * is NOT NULL UNIQUE on the normalized form) and must be logged as a review item instead of a
 * row. See docs/DATABASE_SCHEMA.md § leads.
 */
export interface ParsedLeadRow {
  email: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  website?: string;
  industry?: string;
  country?: string;
  region?: string;
  /** Original row/record as extracted, preserved verbatim into leads.raw_data. */
  rawData: Record<string, unknown>;
  /** Set when this row should never be auto-promoted (see LeadReviewReason). */
  reviewReason?: LeadReviewReason;
  /** 0–1 confidence of the extraction that produced this row. Unset for confidently-structured CSV/XLSX rows. */
  extractionConfidence?: number;
}

/** A row-shaped extraction the pipeline could not turn into a ParsedLeadRow at all (no email found). */
export interface IngestionReviewItem {
  sourceFile: string;
  reason: LeadReviewReason;
  detail: string;
  /** Best-effort snippet of the source content, for a human to act on manually. */
  snippet?: string;
}

export interface IngestionFileError {
  file: string;
  message: string;
}

/** Snapshot of ingestion_jobs progress counters, as surfaced by GET /api/ingestion/jobs/:id. */
export interface IngestionJobProgress {
  id: string;
  sourceType: IngestionSourceType;
  sourceReference: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  totalFilesDiscovered: number;
  filesProcessed: number;
  totalRowsFound: number;
  totalLeadsCreated: number;
  totalLeadsMerged: number;
  totalRowsFlaggedForReview: number;
  totalErrors: number;
  errorDetails: IngestionFileError[];
  reviewItems: IngestionReviewItem[];
  startedAt: string | null;
  completedAt: string | null;
}
