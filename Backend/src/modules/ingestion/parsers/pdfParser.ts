import pdfParseImpl from 'pdf-parse';
import type { IngestionReviewItem, ParsedLeadRow } from '@bebeyond/shared';
import { getAIProvider } from '../../../providers/ai/index.js';
import { mapColumns, type TargetField } from '../columnMapper.js';
import { isValidEmail } from '../normalize.js';
import type { ParseResult } from '../types.js';

/** Below this average chars/page, treat the PDF as having no usable text layer (scanned/image). */
const MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER = 20;
/** PDF table extraction here is a line-splitting heuristic, not real table detection — always uncertain. */
const HEURISTIC_TABLE_CONFIDENCE = 0.5;
const AI_EXTRACTION_SNIPPET_LENGTH = 500;

function splitColumns(line: string): string[] {
  if (line.includes('|'))
    return line
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
  if (line.includes('\t'))
    return line
      .split('\t')
      .map((s) => s.trim())
      .filter(Boolean);
  return line
    .split(/ {2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface DetectedTable {
  headers: string[];
  rows: string[][];
}

/**
 * Best-effort heuristic: looks for a line that fuzzy-maps to lead columns (incl. a confident
 * email column), then treats subsequent same-column-count lines as data rows until the shape
 * breaks. This is not real PDF table extraction (no proper library wired up) — every row it
 * produces is marked 'pdf_heuristic_table_extraction' and must never be auto-promoted.
 */
function detectTable(text: string): DetectedTable | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const cols = splitColumns(lines[i]!);
    if (cols.length < 2) continue;

    const { emailColumnFound } = mapColumns(cols);
    if (!emailColumnFound) continue;

    const headerColCount = cols.length;
    const dataRows: string[][] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const rowCols = splitColumns(lines[j]!);
      if (rowCols.length === headerColCount) {
        dataRows.push(rowCols);
      } else {
        break;
      }
    }

    if (dataRows.length > 0) return { headers: cols, rows: dataRows };
  }

  return null;
}

function buildRowFromTable(
  headers: string[],
  dataRow: string[],
  mapping: Partial<Record<TargetField, string>>,
): ParsedLeadRow | null {
  const record: Record<string, string> = {};
  headers.forEach((h, idx) => {
    record[h] = dataRow[idx] ?? '';
  });

  const rawEmail = mapping.email ? record[mapping.email] : undefined;
  if (!rawEmail || !isValidEmail(rawEmail)) return null;

  return {
    email: rawEmail.trim(),
    companyName: mapping.companyName ? record[mapping.companyName] : undefined,
    contactName: mapping.contactName ? record[mapping.contactName] : undefined,
    phone: mapping.phone ? record[mapping.phone] : undefined,
    website: mapping.website ? record[mapping.website] : undefined,
    industry: mapping.industry ? record[mapping.industry] : undefined,
    country: mapping.country ? record[mapping.country] : undefined,
    region: mapping.region ? record[mapping.region] : undefined,
    rawData: record,
    reviewReason: 'pdf_heuristic_table_extraction',
    extractionConfidence: HEURISTIC_TABLE_CONFIDENCE,
  };
}

export async function parsePdf(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const warnings: string[] = [];
  const reviewItems: IngestionReviewItem[] = [];
  const rows: ParsedLeadRow[] = [];

  let text: string;
  let numPages: number;
  try {
    const parsed = await pdfParseImpl(buffer);
    text = parsed.text ?? '';
    numPages = parsed.numpages || 1;
  } catch (err) {
    throw new Error(`Failed to parse PDF "${fileName}": ${(err as Error).message}`);
  }

  const avgCharsPerPage = text.trim().length / numPages;
  if (avgCharsPerPage < MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER) {
    reviewItems.push({
      sourceFile: fileName,
      reason: 'pdf_scanned_needs_ocr',
      detail: `No usable text layer found (${text.trim().length} chars across ${numPages} page(s)) — likely a scanned/image PDF. OCR is not implemented yet.`,
    });
    return { rows, reviewItems, warnings };
  }

  const table = detectTable(text);
  if (table) {
    const { mapping, ambiguous } = mapColumns(table.headers);
    for (const amb of ambiguous) {
      warnings.push(
        `${fileName}: ambiguous column mapping for "${amb.header}" in detected table — left unmapped`,
      );
    }

    for (const dataRow of table.rows) {
      const row = buildRowFromTable(table.headers, dataRow, mapping);
      if (row) rows.push(row);
    }

    if (rows.length > 0) {
      return { rows, reviewItems, warnings };
    }
    warnings.push(`${fileName}: detected a table-like block but produced no valid rows from it`);
  }

  // Unstructured text (or a detected-but-unusable table). Hand off to the AI provider layer —
  // every implementation is stubbed until Phase 2 (see shared/src/types/ai.ts), so this throws
  // today. That's expected: it means "no confident extraction available", not an ingestion
  // failure, so it becomes a job-level review item rather than propagating as an error.
  try {
    const ai = getAIProvider();
    const result = await ai.extractLeadFieldsFromText({ sourceText: text, sourceFile: fileName });

    for (const candidate of result.candidates) {
      if (!candidate.email || !isValidEmail(candidate.email)) continue;
      rows.push({
        email: candidate.email.trim(),
        companyName: candidate.companyName,
        contactName: candidate.contactName,
        phone: candidate.phone,
        website: candidate.website,
        industry: candidate.industry,
        rawData: candidate as unknown as Record<string, unknown>,
        reviewReason: 'pdf_ai_extraction_pending',
        extractionConfidence: candidate.confidence,
      });
    }
  } catch (err) {
    reviewItems.push({
      sourceFile: fileName,
      reason: 'pdf_ai_extraction_pending',
      detail: `Unstructured PDF text — no table detected and AI extraction is not wired up yet (${(err as Error).message}). Needs manual review.`,
      snippet: text.slice(0, AI_EXTRACTION_SNIPPET_LENGTH),
    });
  }

  return { rows, reviewItems, warnings };
}
