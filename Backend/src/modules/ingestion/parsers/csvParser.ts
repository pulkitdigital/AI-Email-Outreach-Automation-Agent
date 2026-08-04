import { parse } from 'csv-parse/sync';
import type { IngestionReviewItem, ParsedLeadRow } from '@bebeyond/shared';
import { mapColumns } from '../columnMapper.js';
import { isValidEmail } from '../normalize.js';
import type { ParseResult } from '../types.js';

/**
 * Parses a CSV buffer into candidate lead rows. Column mapping is fuzzy (see columnMapper.ts);
 * a file with no confidently-identified email column produces zero rows and a review item
 * instead — we can't build a lead without an email (leads.email is NOT NULL UNIQUE).
 */
export function parseCsv(buffer: Buffer, fileName: string): ParseResult {
  const warnings: string[] = [];
  const reviewItems: IngestionReviewItem[] = [];
  const rows: ParsedLeadRow[] = [];

  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    });
  } catch (err) {
    throw new Error(`Failed to parse CSV "${fileName}": ${(err as Error).message}`);
  }

  if (records.length === 0) {
    warnings.push(`${fileName}: no data rows found`);
    return { rows, reviewItems, warnings };
  }

  const headers = Object.keys(records[0]!);
  const { mapping, ambiguous, emailColumnFound } = mapColumns(headers);

  for (const amb of ambiguous) {
    warnings.push(
      `${fileName}: ambiguous column mapping for "${amb.header}" (could be ${amb.candidateFields.join(' or ')}) — left unmapped`,
    );
  }

  if (!emailColumnFound) {
    reviewItems.push({
      sourceFile: fileName,
      reason: 'ambiguous_column_mapping',
      detail: `No confident email column found among headers: ${headers.join(', ')}`,
    });
    return { rows, reviewItems, warnings };
  }

  const emailHeader = mapping.email!;
  let skippedInvalidEmail = 0;

  for (const record of records) {
    const rawEmail = record[emailHeader];
    if (!rawEmail || !isValidEmail(rawEmail)) {
      skippedInvalidEmail += 1;
      continue;
    }

    rows.push({
      email: rawEmail.trim(),
      companyName: mapping.companyName ? record[mapping.companyName] : undefined,
      contactName: mapping.contactName ? record[mapping.contactName] : undefined,
      phone: mapping.phone ? record[mapping.phone] : undefined,
      website: mapping.website ? record[mapping.website] : undefined,
      industry: mapping.industry ? record[mapping.industry] : undefined,
      country: mapping.country ? record[mapping.country] : undefined,
      region: mapping.region ? record[mapping.region] : undefined,
      rawData: record,
    });
  }

  if (skippedInvalidEmail > 0) {
    warnings.push(`${fileName}: skipped ${skippedInvalidEmail} row(s) with missing/invalid email`);
  }

  return { rows, reviewItems, warnings };
}
