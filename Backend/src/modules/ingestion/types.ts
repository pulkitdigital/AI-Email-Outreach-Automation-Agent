import type { IngestionReviewItem, ParsedLeadRow } from '@bebeyond/shared';

export interface ParseResult {
  rows: ParsedLeadRow[];
  /** Content this parser could not turn into any row at all (no confident email) — needs a human. */
  reviewItems: IngestionReviewItem[];
  /** Non-fatal issues within a single file (a skipped bad row, an unmapped column) — logged, not raised. */
  warnings: string[];
}

export function emptyParseResult(): ParseResult {
  return { rows: [], reviewItems: [], warnings: [] };
}
