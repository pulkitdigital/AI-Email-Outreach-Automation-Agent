import path from 'node:path';
import {
  appendIngestionJobError,
  appendIngestionJobReviewItem,
  incrementIngestionJobCounters,
} from '../../db/repositories/ingestionJobsRepository.js';
import { writeLeadRow } from './leadWriter.js';
import { parseCsv } from './parsers/csvParser.js';
import { parsePdf } from './parsers/pdfParser.js';
import { extractZip } from './parsers/zipParser.js';
import { parseXlsx } from './parsers/xlsxParser.js';
import type { ParseResult } from './types.js';

export type SupportedExtension = 'pdf' | 'csv' | 'xlsx';

export interface LeafFile {
  /** Full path/name for traceability (e.g. "leads.zip/nested/leads.csv" or a Drive file name). */
  path: string;
  buffer: Buffer;
}

export function detectExtension(fileName: string): SupportedExtension | 'zip' | null {
  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  if (ext === 'zip' || ext === 'pdf' || ext === 'csv' || ext === 'xlsx') return ext;
  return null;
}

/**
 * Flattens one uploaded/downloaded file into its processable leaf files: a zip is fully
 * expanded (recursively, nested zips included — see zipParser); anything else is already a
 * single leaf. Callers use this to learn the true file count *before* marking a job "started",
 * so progress ("245/600 files processed") is meaningful from the first tick.
 */
export function expandToLeafFiles(
  fileName: string,
  buffer: Buffer,
): { files: LeafFile[]; warnings: string[] } {
  const ext = detectExtension(fileName);
  if (ext === 'zip') {
    return extractZip(buffer, fileName);
  }
  return { files: [{ path: fileName, buffer }], warnings: [] };
}

async function parseByExtension(
  ext: SupportedExtension,
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  switch (ext) {
    case 'csv':
      return parseCsv(buffer, fileName);
    case 'xlsx':
      return parseXlsx(buffer, fileName);
    case 'pdf':
      return parsePdf(buffer, fileName);
  }
}

async function applyParseResult(
  jobId: string,
  fileName: string,
  result: ParseResult,
): Promise<void> {
  if (result.rows.length > 0) {
    await incrementIngestionJobCounters(jobId, { totalRowsFound: result.rows.length });
    for (const row of result.rows) {
      await writeLeadRow(jobId, fileName, row);
    }
  }

  for (const item of result.reviewItems) {
    await appendIngestionJobReviewItem(jobId, item);
  }

  for (const warning of result.warnings) {
    console.warn(`[ingestion] job=${jobId} ${warning}`);
  }
}

/**
 * Processes exactly one already-expanded leaf file (never a zip — expand first via
 * expandToLeafFiles). Never throws: a corrupt/unparseable file is logged to
 * ingestion_jobs.error_details and counted in total_errors, and filesProcessed is incremented
 * regardless of outcome, so the batch always keeps moving and progress always advances.
 */
export async function processLeafFile(
  jobId: string,
  fileName: string,
  buffer: Buffer,
): Promise<void> {
  const ext = detectExtension(fileName);

  if (!ext || ext === 'zip') {
    console.warn(`[ingestion] job=${jobId} skipping unsupported file: ${fileName}`);
    await incrementIngestionJobCounters(jobId, { filesProcessed: 1 });
    return;
  }

  try {
    const result = await parseByExtension(ext, buffer, fileName);
    await applyParseResult(jobId, fileName, result);
  } catch (err) {
    console.error(`[ingestion] job=${jobId} failed to process ${fileName}:`, err);
    await appendIngestionJobError(jobId, { file: fileName, message: (err as Error).message });
    await incrementIngestionJobCounters(jobId, { totalErrors: 1 });
  } finally {
    await incrementIngestionJobCounters(jobId, { filesProcessed: 1 });
  }
}
