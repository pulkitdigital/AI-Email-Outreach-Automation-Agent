/**
 * Resets one or more test leads back to a fresh 'deck_generated' state for local dev testing —
 * deletes their send history (sent_emails_log rows, email_sequences row) and resets
 * leads.status to 'deck_generated' so a manual "Send Now" is immediately eligible again, without
 * re-running categorization or deck generation. pitch_decks rows are left untouched (no need to
 * regenerate — see sendingService.ts's ELIGIBLE_STATUSES_BY_STAGE, which requires exactly
 * 'deck_generated' for a 'new'-stage send).
 *
 * SAFETY: refuses to touch any email that doesn't match one of the KNOWN_TEST_PATTERNS below —
 * pass --force to override for a one-off address not yet on that list. This is the only guard;
 * there's no environment check beyond it, so pointing DATABASE_URL at anything other than a dev
 * database is entirely the caller's responsibility.
 *
 * Usage:
 *   npx tsx Backend/scripts/resetTestLeads.ts <email> [<email> ...]
 *   npx tsx Backend/scripts/resetTestLeads.ts --domain gmail.com
 *   npx tsx Backend/scripts/resetTestLeads.ts someone@not-yet-listed.com --force
 */
import { pool } from '../src/db/pool.js';
import { normalizeEmail } from '../src/modules/ingestion/normalize.js';

/**
 * Known test/demo domains and addresses safe to reset without --force. Extend this list as new
 * test leads get created for local dev/QA — never add a real prospect's domain here.
 */
const KNOWN_TEST_PATTERNS: RegExp[] = [
  // Personal gmail addresses used for manual send-now testing (e.g. akadityakumar002@gmail.com).
  /^[^@]+@gmail\.com$/i,
  // Any subdomain of demo.com (e.g. leads@acme.demo.com).
  /^[^@]+@([^@]+\.)?demo\.com$/i,
  // RFC 2606 reserved domain, and its subdomains — used by ingestion test fixtures.
  /^[^@]+@([^@]+\.)?example\.com$/i,
];

function isKnownTestAddress(email: string): boolean {
  return KNOWN_TEST_PATTERNS.some((pattern) => pattern.test(email));
}

interface ParsedArgs {
  emails: string[];
  domains: string[];
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const emails: string[] = [];
  const domains: string[] = [];
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '--force') {
      force = true;
    } else if (arg === '--domain') {
      const value = argv[++i];
      if (!value) throw new Error('--domain requires a value, e.g. --domain gmail.com');
      // Accept either "gmail.com" or "*@gmail.com" for a friendlier CLI.
      domains.push(value.replace(/^\*@/, '').toLowerCase());
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      emails.push(arg);
    }
  }

  return { emails, domains, force };
}

/** Expands explicit emails + --domain matches (queried against leads) into one deduped, normalized list. */
async function resolveTargetEmails(args: ParsedArgs): Promise<string[]> {
  const explicit = args.emails.map(normalizeEmail);

  const fromDomains: string[] = [];
  for (const domain of args.domains) {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM leads WHERE email_normalized LIKE $1`,
      [`%@${domain}`],
    );
    fromDomains.push(...rows.map((r) => normalizeEmail(r.email)));
  }

  return Array.from(new Set([...explicit, ...fromDomains]));
}

interface ResetSummary {
  email: string;
  found: boolean;
  leadId: string | null;
  previousStatus: string | null;
  sentEmailsDeleted: number;
  sequenceReset: boolean;
}

/**
 * Deletes one lead's send history and resets its status, all in a single transaction — either
 * every step below lands, or (on any error) none of them do.
 */
async function resetLead(emailNormalized: string): Promise<ResetSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const leadResult = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM leads WHERE email_normalized = $1 FOR UPDATE`,
      [emailNormalized],
    );
    const lead = leadResult.rows[0];
    if (!lead) {
      await client.query('ROLLBACK');
      return {
        email: emailNormalized,
        found: false,
        leadId: null,
        previousStatus: null,
        sentEmailsDeleted: 0,
        sequenceReset: false,
      };
    }

    const deletedSends = await client.query('DELETE FROM sent_emails_log WHERE lead_id = $1', [
      lead.id,
    ]);

    // Deleted rather than reset-in-place: email_sequences has UNIQUE(lead_id), and a fresh row
    // (current_stage='new', every stage_*_at column null) is exactly what
    // getOrCreateSequenceForLead() lazily creates on the next send attempt anyway — deleting lets
    // that existing codepath do the work instead of this script re-deriving every default here.
    const deletedSequence = await client.query(
      'DELETE FROM email_sequences WHERE lead_id = $1',
      [lead.id],
    );

    // pitch_decks is deliberately left untouched — no need to regenerate. status_manually_set and
    // review_reason are cleared too, so this reads as a genuinely fresh 'deck_generated' lead
    // rather than one carrying stale manual-override/needs-review state from a prior test run.
    await client.query(
      `UPDATE leads SET status = 'deck_generated', status_manually_set = false, review_reason = NULL
       WHERE id = $1`,
      [lead.id],
    );

    await client.query('COMMIT');

    return {
      email: emailNormalized,
      found: true,
      leadId: lead.id,
      previousStatus: lead.status,
      sentEmailsDeleted: deletedSends.rowCount ?? 0,
      sequenceReset: (deletedSequence.rowCount ?? 0) > 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.emails.length === 0 && args.domains.length === 0) {
    console.error(
      'Usage: npx tsx Backend/scripts/resetTestLeads.ts <email> [<email> ...] [--domain <domain>] [--force]',
    );
    process.exitCode = 1;
    return;
  }

  const targets = await resolveTargetEmails(args);
  if (targets.length === 0) {
    console.log('No matching leads found for the given email(s)/domain(s) — nothing to reset.');
    await pool.end();
    return;
  }

  const blocked = targets.filter((email) => !isKnownTestAddress(email));
  if (blocked.length > 0 && !args.force) {
    console.error(
      "Refusing to run — the following address(es) don't match a known test pattern (see KNOWN_TEST_PATTERNS at the top of this script):",
    );
    for (const email of blocked) console.error(`  - ${email}`);
    console.error(
      '\nIf these are genuinely test/demo leads, pass --force to override, or add a pattern for them to KNOWN_TEST_PATTERNS.',
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }
  if (blocked.length > 0) {
    console.warn(
      `--force passed: proceeding despite ${blocked.length} address(es) not matching a known test pattern.\n`,
    );
  }

  console.log(`Resetting ${targets.length} lead(s):\n`);

  for (const email of targets) {
    const summary = await resetLead(email);
    if (!summary.found) {
      console.log(`- ${email}: no matching lead found — skipped.`);
      continue;
    }
    console.log(`- ${email} (lead ${summary.leadId})`);
    console.log(`    sent_emails_log rows deleted: ${summary.sentEmailsDeleted}`);
    console.log(
      `    email_sequences row: ${summary.sequenceReset ? 'deleted (will be recreated fresh on next send)' : 'none existed'}`,
    );
    console.log(`    status: '${summary.previousStatus}' -> 'deck_generated'`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('resetTestLeads failed:', err);
  process.exitCode = 1;
});
