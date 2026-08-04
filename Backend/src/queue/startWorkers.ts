import { env } from '../config/env.js';
import { assertEmailProviderReady } from '../providers/email/index.js';
import { DAILY_SCHEDULER_JOB_ID, schedulerQueue } from './queues.js';
import { categorizationWorker } from './workers/categorizationWorker.js';
import { deckGenerationWorker } from './workers/deckGenerationWorker.js';
import { ingestionWorker } from './workers/ingestionWorker.js';
import { schedulerWorker } from './workers/schedulerWorker.js';
import { sendingWorker } from './workers/sendingWorker.js';

// Fail loudly at boot if EMAIL_PROVIDER is misconfigured (e.g. 'gmail' before it's wired up),
// rather than crashing unexpectedly deep in a send job later. See providers/email/index.ts.
try {
  assertEmailProviderReady();
} catch (err) {
  console.error('[startup] email provider is not ready:', err);
  process.exit(1);
}

/**
 * Registers (or refreshes) the once-daily automated scheduler run — this is what makes Phase 5
 * "zero manual intervention day-to-day": once this worker process is running, the Daily
 * Scheduler fires itself on SCHEDULER_CRON (in SCHEDULER_TIMEZONE) with no further action needed.
 * upsertJobScheduler is idempotent by jobSchedulerId — safe to call on every worker boot, it just
 * updates the schedule if SCHEDULER_CRON changed rather than creating a duplicate.
 */
async function registerDailySchedulerJob(): Promise<void> {
  await schedulerQueue.upsertJobScheduler(
    DAILY_SCHEDULER_JOB_ID,
    { pattern: env.SCHEDULER_CRON, tz: env.SCHEDULER_TIMEZONE },
    { name: 'run', data: { trigger: 'repeatable' } },
  );
  console.log(
    `[startup] daily scheduler registered: cron '${env.SCHEDULER_CRON}' in ${env.SCHEDULER_TIMEZONE}`,
  );
}

registerDailySchedulerJob().catch((err) => {
  console.error('[startup] failed to register daily scheduler job:', err);
  process.exit(1);
});

console.log(
  '[workers] ingestion + categorization + deck-generation + sending + scheduler workers started, waiting for jobs...',
);

async function shutdown(signal: string): Promise<void> {
  console.log(`[workers] received ${signal}, shutting down gracefully...`);
  await Promise.all([
    ingestionWorker.close(),
    categorizationWorker.close(),
    deckGenerationWorker.close(),
    sendingWorker.close(),
    schedulerWorker.close(),
  ]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
