import { Worker, type Job } from 'bullmq';
import {
  categorizeLead,
  markCategorizationFailed,
} from '../../modules/categorization/categorizationService.js';
import { AIConfigError } from '../../providers/ai/errors.js';
import { redisConnection } from '../connection.js';
import { CATEGORIZATION_QUEUE_NAME, type CategorizationJobData } from '../queues.js';

/**
 * concurrency: 3 (unlike the ingestion worker's concurrency: 1) — each job targets a distinct
 * lead id, so there's no shared-row race to protect against, and some parallelism helps AI
 * fallback calls (rule-based matches resolve instantly with no external call at all).
 */
export const categorizationWorker = new Worker<CategorizationJobData>(
  CATEGORIZATION_QUEUE_NAME,
  async (job: Job<CategorizationJobData>) => {
    const { leadId } = job.data;

    try {
      await categorizeLead(leadId);
    } catch (err) {
      if (err instanceof AIConfigError) {
        // Retrying a missing/invalid API key can never succeed — don't burn the backoff window.
        console.error(
          `[categorization-worker] lead ${leadId} misconfigured AI provider, skipping retries:`,
          err,
        );
        await markCategorizationFailed(leadId);
        return;
      }

      const attemptsAllowed = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

      if (isFinalAttempt) {
        console.error(
          `[categorization-worker] lead ${leadId} failed after ${attemptsAllowed} attempt(s), marking needs_review:`,
          err,
        );
        await markCategorizationFailed(leadId);
        return;
      }

      console.warn(
        `[categorization-worker] lead ${leadId} attempt ${job.attemptsMade + 1} failed, will retry:`,
        err,
      );
      throw err; // let BullMQ retry with backoff
    }
  },
  { connection: redisConnection, concurrency: 3 },
);

categorizationWorker.on('failed', (job, err) => {
  console.error(
    `[categorization-worker] job ${job?.id} (attempt ${job?.attemptsMade}) failed:`,
    err,
  );
});

categorizationWorker.on('error', (err) => {
  console.error('[categorization-worker] worker-level error:', err);
});
