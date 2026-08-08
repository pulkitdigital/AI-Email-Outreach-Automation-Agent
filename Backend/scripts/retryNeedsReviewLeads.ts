/**
 * One-time retry: re-runs categorizeLead() for every lead currently in 'needs_review' status, now
 * that Part B (categorizationService.ts's AI-suggested-new-category flow) exists — most of these
 * leads never got a genuine "no category fits" verdict; they hard-failed the AI call entirely
 * (review_reason 'ai_categorization_failed', set by markCategorizationFailed() once BullMQ's
 * retries were exhausted) with nowhere to go before Part B existed. Re-running now gives the AI a
 * real chance to either match an existing category or propose a brand-new one.
 *
 * Skips (logs, does not touch) any lead with status_manually_set = true — a human's deliberate
 * override is never silently re-triggered by an automated retry. None exist among today's
 * needs_review leads (verified before writing this script), but the guard stays for safety.
 *
 * 1.5s delay between leads (rate-limit safety) — categorizeLead() itself may make 1 or 2 real AI
 * calls per lead (categorization, plus content-generation the first time a brand-new category is
 * proposed — see categoryContentGenerationService.ts; a second lead landing in the same new
 * category reuses it with no extra AI call).
 *
 * Safe to re-run: a lead this pass successfully resolves moves out of needs_review and won't be
 * re-selected by a later run's WHERE status = 'needs_review' query; anything still stuck (AI call
 * failed again, or genuinely no fit found) stays needs_review and is simply retried again.
 *
 * Usage:
 *   npx tsx Backend/scripts/retryNeedsReviewLeads.ts
 */
import { categorizeLead } from '../src/modules/categorization/categorizationService.js';
import { pool } from '../src/db/pool.js';

const DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TargetLead {
  id: string;
  email: string;
  companyName: string | null;
}

async function fetchTargets(): Promise<TargetLead[]> {
  const { rows } = await pool.query(
    `SELECT id, email, company_name AS "companyName"
     FROM leads
     WHERE status = 'needs_review' AND status_manually_set = false
     ORDER BY created_at ASC`,
  );
  return rows as TargetLead[];
}

type Outcome = 'categorized' | 'still_needs_review' | 'error';

interface OutcomeRow {
  email: string;
  outcome: Outcome;
  categoryName: string | null;
  categorySlug: string | null;
  wasNewCategory: boolean;
  errorMessage: string | null;
}

async function processLead(lead: TargetLead): Promise<OutcomeRow> {
  try {
    await categorizeLead(lead.id);
  } catch (err) {
    return {
      email: lead.email,
      outcome: 'error',
      categoryName: null,
      categorySlug: null,
      wasNewCategory: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const { rows } = await pool.query(
    `SELECT l.status, c.name AS "categoryName", c.slug AS "categorySlug",
            c.review_reason AS "categoryReviewReason"
     FROM leads l
     LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.id = $1`,
    [lead.id],
  );
  const row = rows[0] as
    | { status: string; categoryName: string | null; categorySlug: string | null; categoryReviewReason: string | null }
    | undefined;

  if (!row || row.status === 'needs_review') {
    return {
      email: lead.email,
      outcome: 'still_needs_review',
      categoryName: null,
      categorySlug: null,
      wasNewCategory: false,
      errorMessage: null,
    };
  }

  return {
    email: lead.email,
    outcome: 'categorized',
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    wasNewCategory: row.categoryReviewReason === 'ai_created_new_category',
    errorMessage: null,
  };
}

async function main(): Promise<void> {
  const targets = await fetchTargets();
  console.log(
    `Found ${targets.length} needs_review lead(s) eligible for retry (status_manually_set=false).\n`,
  );

  if (targets.length === 0) {
    await pool.end();
    return;
  }

  const results: OutcomeRow[] = [];

  for (let i = 0; i < targets.length; i++) {
    const lead = targets[i]!;
    console.log(
      `[${i + 1}/${targets.length}] ${lead.email} (${lead.companyName ?? 'no company name'}) — retrying...`,
    );

    const result = await processLead(lead);
    results.push(result);

    if (result.outcome === 'categorized') {
      console.log(
        `  -> categorized into "${result.categoryName}" (${result.categorySlug})` +
          (result.wasNewCategory ? ' — BRAND-NEW category created by AI' : ''),
      );
    } else if (result.outcome === 'still_needs_review') {
      console.log(
        '  -> still needs_review (AI found no fit and proposed no new category, or the response was untrustworthy)',
      );
    } else {
      console.log(`  -> ERROR (left untouched, still needs_review): ${result.errorMessage}`);
    }

    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  const categorized = results.filter((r) => r.outcome === 'categorized');
  const stillNeedsReview = results.filter((r) => r.outcome === 'still_needs_review');
  const errored = results.filter((r) => r.outcome === 'error');
  const newCategoryFixes = categorized.filter((r) => r.wasNewCategory);

  console.log('\n=== SUMMARY ===');
  console.log(`Total processed: ${results.length}`);
  console.log(`Categorized (fixed): ${categorized.length}`);
  console.log(`  - into a brand-new AI-created category: ${newCategoryFixes.length}`);
  console.log(`  - into an existing category: ${categorized.length - newCategoryFixes.length}`);
  console.log(`Still needs_review: ${stillNeedsReview.length}`);
  console.log(`Errored (AI call failed again this run too): ${errored.length}`);

  if (categorized.length > 0) {
    console.log('\nCategorized leads:');
    for (const r of categorized) {
      console.log(`  - ${r.email} -> ${r.categoryName} (${r.categorySlug})${r.wasNewCategory ? ' [NEW]' : ''}`);
    }
  }

  if (errored.length > 0) {
    console.log('\nErrored leads (unchanged, still needs_review — safe to re-run this script later):');
    for (const r of errored) {
      console.log(`  - ${r.email}: ${r.errorMessage}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error('retryNeedsReviewLeads failed:', err);
  process.exitCode = 1;
});
