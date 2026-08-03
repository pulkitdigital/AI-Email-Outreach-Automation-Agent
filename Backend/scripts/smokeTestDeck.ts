/**
 * One-off manual smoke test: builds a real .pptx for a fake lead and verifies the output is a
 * structurally valid PowerPoint file (correct ZIP/OOXML internals, expected slide count). Not
 * part of the automated suite (pptxgenjs generation isn't mocked here on purpose — this is the
 * one place that actually exercises it). Run: npx tsx Backend/scripts/smokeTestDeck.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { buildDeckForLead } from '../src/modules/deckGeneration/deckBuilder.js';
import {
  orderCategoriesForLead,
  SERVICE_CATEGORIES,
} from '../src/modules/deckGeneration/serviceCatalog.js';
import { TMP_DIR } from '../src/config/paths.js';

async function main() {
  console.log('=== Building deck for a "Marketplace & Commerce" lead ===');
  const buffer = await buildDeckForLead({
    companyName: 'Ganga RiverFront Rooms & Banquet',
    primaryCategorySlug: 'marketplace-commerce',
  });

  console.log(`Generated buffer: ${buffer.length} bytes`);

  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = `${TMP_DIR}/smoke-test-deck.pptx`;
  writeFileSync(outputPath, buffer);
  console.log(`Wrote ${outputPath} for manual inspection (Backend/tmp is gitignored).`);

  console.log('\n=== Verifying OOXML structure (pptx is a zip) ===');
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().map((e) => e.entryName);

  const hasPresentation = entries.includes('ppt/presentation.xml');
  const slideEntries = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e));
  const hasContentTypes = entries.includes('[Content_Types].xml');

  console.log(`[Content_Types].xml present: ${hasContentTypes}`);
  console.log(`ppt/presentation.xml present: ${hasPresentation}`);
  console.log(`Slide count: ${slideEntries.length} (expect 12)`);

  if (!hasContentTypes || !hasPresentation || slideEntries.length !== 12) {
    throw new Error('Deck failed structural validation');
  }

  console.log('\n=== Verifying category reorder logic against real catalog data ===');
  const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, 'marketplace-commerce');
  console.log(ordered.map((c) => c.displayName));
  if (ordered[0]?.slug !== 'marketplace-commerce') {
    throw new Error('Primary category was not moved to the front');
  }

  console.log('\n✅ Deck generation smoke test passed.');
}

main().catch((err) => {
  console.error('Deck smoke test failed:', err);
  process.exit(1);
});
