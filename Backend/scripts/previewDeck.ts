/**
 * Preview script for the react-pdf deck pipeline — the "no preview script" gap noted in
 * Docs/STATUS.md, but for `buildDeckPdfForLead()` (the current pipeline), not the legacy
 * pptxgenjs `buildDeckForLead()` that scripts/smokeTestDeck.ts already covers.
 *
 * Builds a real deck for one representative test lead and writes the PDF to disk so it can be
 * opened and reviewed by hand — no DB, no queue, no storage upload. Not part of the automated
 * suite (deliberately exercises the real react-pdf render, same spirit as smokeTestDeck.ts).
 *
 * Run: npx tsx Backend/scripts/previewDeck.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildDeckPdfForLead } from '../src/modules/deckGeneration/pdf/generateDeckPdf.js';
import { TMP_DIR } from '../src/config/paths.js';

async function main() {
  console.log('=== Building deck for "Radiance Skin Studio" (Beauty & Wellness Salon) ===');

  const { buffer, pageCount } = await buildDeckPdfForLead({
    companyName: 'Radiance Skin Studio',
    industry: 'Beauty & Wellness Salon',
    primaryCategorySlug: 'digital-marketing',
  });

  console.log(`Generated buffer: ${buffer.length} bytes, ${pageCount} pages`);

  const outputDir = `${TMP_DIR}/sample-decks`;
  mkdirSync(outputDir, { recursive: true });
  const outputPath = `${outputDir}/radiance-skin-studio-sample.pdf`;
  writeFileSync(outputPath, buffer);
  console.log(`Wrote ${outputPath} for manual inspection (Backend/tmp is gitignored).`);
}

main().catch((err) => {
  console.error('Deck preview script failed:', err);
  process.exit(1);
});
