/**
 * One-time backfill: finds every category with zero category_content rows (pre-existing
 * categories created before migrations/0010_category_content.sql — e.g. manually-added
 * dashboard categories like 'hospitality' — or ones a content-generation call failed for
 * previously, see categorizationService.ts's findOrCreateSuggestedCategory) and generates both
 * rows ('our_services' + 'how_can_we_help') for each via AI, using the same
 * generateAndStoreCategoryContent() the auto-create-on-categorize flow uses.
 *
 * Safe to re-run: only touches categories with zero content_content rows for either type, so an
 * earlier partial run (some categories backfilled, one failed) picks up exactly where it left off.
 * Per-category failures are caught and logged; one category failing never aborts the rest.
 *
 * Usage:
 *   npx tsx Backend/scripts/backfillCategoryContent.ts
 */
import { generateAndStoreCategoryContent } from '../src/modules/categoryContent/categoryContentGenerationService.js';
import { pool } from '../src/db/pool.js';
import type { CategoryRecord } from '../src/db/repositories/categoriesRepository.js';

interface MissingCategoryRow extends CategoryRecord {
  id: string;
}

/** Same LEFT JOIN / zero-content-rows definition used to investigate this before writing the script. */
async function findCategoriesMissingContent(): Promise<MissingCategoryRow[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.service_group AS "serviceGroup",
            c.needs_review AS "needsReview", c.review_reason AS "reviewReason"
     FROM categories c
     LEFT JOIN category_content cc ON cc.category_id = c.id
     WHERE c.is_active = true
     GROUP BY c.id, c.name, c.slug, c.service_group, c.needs_review, c.review_reason
     HAVING COUNT(cc.id) = 0
     ORDER BY c.created_at ASC`,
  );
  return rows as MissingCategoryRow[];
}

async function main(): Promise<void> {
  const missing = await findCategoriesMissingContent();

  if (missing.length === 0) {
    console.log('No categories are missing category_content rows — nothing to backfill.');
    await pool.end();
    return;
  }

  console.log(`Found ${missing.length} categor${missing.length === 1 ? 'y' : 'ies'} missing category_content:`);
  for (const category of missing) console.log(`  - ${category.name} (${category.slug})`);
  console.log('');

  let succeeded = 0;
  let failed = 0;

  for (const category of missing) {
    try {
      await generateAndStoreCategoryContent(category);
      succeeded += 1;
      console.log(`✓ ${category.name} (${category.slug}) — content generated and stored`);
    } catch (err) {
      failed += 1;
      console.error(`✗ ${category.name} (${category.slug}) — backfill failed:`, err);
    }
  }

  console.log(
    `\nDone. ${succeeded} backfilled, ${failed} failed${failed > 0 ? ' (re-run this script to retry the failed ones)' : ''}.`,
  );

  await pool.end();
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('backfillCategoryContent failed:', err);
  process.exitCode = 1;
});
