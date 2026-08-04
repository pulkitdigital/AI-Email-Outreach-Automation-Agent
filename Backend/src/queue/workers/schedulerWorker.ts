import { Worker, type Job } from 'bullmq';
import { runDailyScheduler } from '../../modules/scheduler/dailySchedulerService.js';
import { redisConnection } from '../connection.js';
import { SCHEDULER_QUEUE_NAME } from '../queues.js';

/**
 * Processes both the daily repeatable job and any manual test trigger (routes/scheduler.ts) —
 * they're the same job on the same queue, distinguished only by job.data.trigger for logging.
 * runDailyScheduler() never throws: every step is individually try/caught internally and
 * failures are collected into the daily_summary row's scheduler_errors instead (see
 * dailySchedulerService.ts) — so BullMQ never needs to retry a scheduler run wholesale on a
 * partial failure; a re-run (next day's repeatable job, or a manual re-trigger) is always safe
 * regardless, per that module's idempotency design.
 */
export const schedulerWorker = new Worker(
  SCHEDULER_QUEUE_NAME,
  async (job: Job<{ trigger?: string }>) => {
    console.log(
      `[scheduler-worker] running daily scheduler (job ${job.id}, trigger: ${job.data?.trigger ?? 'repeatable'})`,
    );
    return runDailyScheduler();
  },
  {
    connection: redisConnection,
    concurrency: 1, // only one scheduler run in flight at a time, ever
  },
);

schedulerWorker.on('failed', (job, err) => {
  console.error(`[scheduler-worker] job ${job?.id} failed:`, err);
});

schedulerWorker.on('error', (err) => {
  console.error('[scheduler-worker] worker-level error:', err);
});
