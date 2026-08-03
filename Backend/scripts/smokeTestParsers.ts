/**
 * One-off manual smoke test for the file parsers against real sample files, run without a
 * database (parseCsv/parseXlsx/extractZip are pure — no DB writes). Not part of the automated
 * test suite; kept for ad-hoc verification. Run with:
 *   npx tsx Backend/scripts/smokeTestParsers.ts <path-to-csv>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import { parseCsv } from '../src/modules/ingestion/parsers/csvParser.js';
import { parseXlsx } from '../src/modules/ingestion/parsers/xlsxParser.js';
import { extractZip } from '../src/modules/ingestion/parsers/zipParser.js';
import { TMP_DIR } from '../src/config/paths.js';

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: tsx smokeTestParsers.ts <path-to-csv>');
    process.exit(1);
  }

  const csvBuffer = readFileSync(csvPath);

  console.log('\n=== parseCsv ===');
  const csvResult = parseCsv(csvBuffer, 'leads.csv');
  console.log(JSON.stringify(csvResult, null, 2));

  console.log('\n=== building + parsing an XLSX with 2 sheets ===');
  const workbook = new ExcelJS.Workbook();
  const sheet1 = workbook.addWorksheet('Sheet1');
  sheet1.addRow(['Email', 'Company Name', 'Phone']);
  sheet1.addRow(['alice@example.com', 'Alice Co', '111-2222']);
  sheet1.addRow(['bad-email', 'Skip Co', '000-0000']);

  const sheet2 = workbook.addWorksheet('Sheet2 - No Email Column');
  sheet2.addRow(['Random', 'Notes']);
  sheet2.addRow(['x', 'y']);

  const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const xlsxResult = await parseXlsx(xlsxBuffer, 'leads.xlsx');
  console.log(JSON.stringify(xlsxResult, null, 2));

  console.log('\n=== building + extracting a ZIP (incl. nested zip) ===');
  const innerZip = new AdmZip();
  innerZip.addFile('nested/leads-nested.csv', csvBuffer);

  const outerZip = new AdmZip();
  outerZip.addFile('leads-top.csv', csvBuffer);
  outerZip.addFile('nested.zip', innerZip.toBuffer());
  const outerZipBuffer = outerZip.toBuffer();

  const zipResult = extractZip(outerZipBuffer, 'bundle.zip');
  console.log(
    JSON.stringify(
      { files: zipResult.files.map((f) => f.path), warnings: zipResult.warnings },
      null,
      2,
    ),
  );

  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = `${TMP_DIR}/smoke-test-xlsx-output.xlsx`;
  writeFileSync(outputPath, xlsxBuffer);
  console.log(`\nWrote ${outputPath} for manual inspection (Backend/tmp is gitignored).`);

  console.log('\n=== SUMMARY ===');
  console.log(
    `CSV: ${csvResult.rows.length} rows, ${csvResult.reviewItems.length} review items, ${csvResult.warnings.length} warnings`,
  );
  console.log(
    `XLSX: ${xlsxResult.rows.length} rows, ${xlsxResult.reviewItems.length} review items, ${xlsxResult.warnings.length} warnings`,
  );
  console.log(
    `ZIP: ${zipResult.files.length} leaf files extracted (expect 2: leads-top.csv + nested/leads-nested.csv)`,
  );
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
