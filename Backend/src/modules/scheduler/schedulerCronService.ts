// Node's ESM loader can't statically detect cron-parser's (CJS) named exports — import the
// whole module and destructure at runtime instead of `import { parseExpression } from ...`.
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import { env } from '../../config/env.js';
import { getSetting, setSetting } from '../../db/repositories/settingsRepository.js';
import { DAILY_SCHEDULER_JOB_ID, schedulerQueue } from '../../queue/queues.js';

const SCHEDULER_CRON_SETTING_KEY = 'scheduler_cron';

export class InvalidCronError extends Error {}

/** DB row wins over env.SCHEDULER_CRON — env is only the first-run fallback (see 0011's seed). */
export async function getSchedulerCron(): Promise<string> {
  const stored = await getSetting(SCHEDULER_CRON_SETTING_KEY);
  return stored ?? env.SCHEDULER_CRON;
}

function assertValidCron(pattern: string): void {
  // Matches SCHEDULER_CRON's existing usage (env.ts, .env.example) — a standard 5-field
  // "M H day month weekday" expression, no seconds field.
  if (pattern.split(/\s+/).length !== 5) {
    throw new InvalidCronError(`'${pattern}' is not a valid 5-field cron expression`);
  }
  try {
    parseExpression(pattern, { tz: env.SCHEDULER_TIMEZONE });
  } catch (err) {
    throw new InvalidCronError(
      `'${pattern}' is not a valid cron expression: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Registers/updates the once-daily automated scheduler run with BullMQ. upsertJobScheduler is
 * idempotent by DAILY_SCHEDULER_JOB_ID — calling it again with a new pattern atomically replaces
 * the existing repeatable job's schedule in place rather than creating a duplicate, so there is no
 * separate "remove the old job" step needed.
 */
async function registerSchedulerJob(pattern: string): Promise<void> {
  await schedulerQueue.upsertJobScheduler(
    DAILY_SCHEDULER_JOB_ID,
    { pattern, tz: env.SCHEDULER_TIMEZONE },
    { name: 'run', data: { trigger: 'repeatable' } },
  );
}

/** Called once at worker startup — see queue/startWorkers.ts. */
export async function initSchedulerCron(): Promise<string> {
  const pattern = await getSchedulerCron();
  await registerSchedulerJob(pattern);
  return pattern;
}

/**
 * Called by PUT /api/settings/scheduler-cron. Validates, persists, then re-registers the BullMQ
 * job with the new pattern — updating the DB alone and leaving the old job running would defeat
 * the point of the feature.
 */
export async function updateSchedulerCron(pattern: string): Promise<string> {
  const trimmed = pattern.trim();
  assertValidCron(trimmed);
  await setSetting(SCHEDULER_CRON_SETTING_KEY, trimmed);
  await registerSchedulerJob(trimmed);
  return trimmed;
}
