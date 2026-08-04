import ExcelJS from 'exceljs';
import type { IngestionReviewItem, ParsedLeadRow } from '@bebeyond/shared';
import { mapColumns } from '../columnMapper.js';
import { isValidEmail } from '../normalize.js';
import type { ParseResult } from '../types.js';

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text; // hyperlink
    if ('result' in value) return String((value as { result: unknown }).result ?? ''); // formula
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('');
    }
    return '';
  }
  return String(value);
}

function worksheetToRecords(worksheet: ExcelJS.Worksheet): {
  headers: string[];
  records: Record<string, string>[];
} {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value).trim();
  });

  const records: Record<string, string>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const value = cellToString(row.getCell(colNumber).value);
      if (value) hasValue = true;
      record[header] = value;
    });

    if (hasValue) records.push(record);
  }

  return { headers: headers.filter(Boolean), records };
}

/**
 * Parses every sheet in the workbook independently (a workbook commonly has one lead list per
 * sheet, sometimes with different columns per sheet). A sheet with no confident email column
 * produces a review item scoped to that sheet and is skipped; other sheets in the same file
 * still get processed.
 */
export async function parseXlsx(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const warnings: string[] = [];
  const reviewItems: IngestionReviewItem[] = [];
  const rows: ParsedLeadRow[] = [];

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err) {
    throw new Error(`Failed to parse XLSX "${fileName}": ${(err as Error).message}`);
  }

  if (workbook.worksheets.length === 0) {
    warnings.push(`${fileName}: workbook has no sheets`);
    return { rows, reviewItems, warnings };
  }

  for (const worksheet of workbook.worksheets) {
    const sheetLabel = `${fileName}#${worksheet.name}`;
    const { headers, records } = worksheetToRecords(worksheet);

    if (records.length === 0) {
      warnings.push(`${sheetLabel}: no data rows found`);
      continue;
    }

    const { mapping, ambiguous, emailColumnFound } = mapColumns(headers);
    for (const amb of ambiguous) {
      warnings.push(
        `${sheetLabel}: ambiguous column mapping for "${amb.header}" (could be ${amb.candidateFields.join(' or ')}) — left unmapped`,
      );
    }

    if (!emailColumnFound) {
      reviewItems.push({
        sourceFile: sheetLabel,
        reason: 'ambiguous_column_mapping',
        detail: `No confident email column found among headers: ${headers.join(', ')}`,
      });
      continue;
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
      warnings.push(
        `${sheetLabel}: skipped ${skippedInvalidEmail} row(s) with missing/invalid email`,
      );
    }
  }

  return { rows, reviewItems, warnings };
}
