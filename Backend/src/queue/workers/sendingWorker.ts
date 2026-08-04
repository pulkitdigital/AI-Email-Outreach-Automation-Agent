import { Worker, type Job } from 'bullmq';
import { env } from '../../config/env.js';
import { markSendFailed, sendSequenceEmail } from '../../modules/sendingEngine/sendingService.js';
import { SendPreconditionError } from '../../modules/sendingEngine/errors.js';
import { EmailApiError } from '../../providers/email/errors.js';
import { redisConnection } from '../connection.js';
import { EMAIL_SEND_QUEUE_NAME, type SendEmailJobData } from '../queues.js';

/**
 * concurrency: 2 (conservative — actual send throughput is governed by the `limiter` below, not
 * concurrency; a low concurrency just bounds how many sends can be composing/in-flight at once).
 * limiter respects Brevo's rate limits — see EMAIL_SEND_RATE_LIMIT_MAX/DURATION_MS in .env
 * (conservative default for the free tier; raise once the plan/limits are confirmed).
 */
export const sendingWorker = new Worker<SendEmailJobData>(
  EMAIL_SEND_QUEUE_NAME,
  async (job: Job<SendEmailJobData>) => {
    const { leadId, stage } = job.data;

    try {
      await sendSequenceEmail(leadId, stage);
    } catch (err) {
      if (err instanceof SendPreconditionError) {
        // Retrying can't fix a precondition violation (wrong lead status, no category, dedup
        // collision) — don't burn the backoff window on it.
        console.error(
          `[sending-worker] lead ${leadId} stage '${stage}' failed precondition, skipping retries:`,
          err,
        );
        await markSendFailed(leadId);
        return;
      }

      if (err instanceof EmailApiError && !err.retryable) {
        console.error(
          `[sending-worker] lead ${leadId} stage '${stage}' hit a permanent provider error, skipping retries:`,
          err,
        );
        await markSendFailed(leadId);
        return;
      }

      const attemptsAllowed = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

      if (isFinalAttempt) {
        console.error(
          `[sending-worker] lead ${leadId} stage '${stage}' failed after ${attemptsAllowed} attempt(s), pausing sequence:`,
          err,
        );
        await markSendFailed(leadId);
        return;
      }

      console.warn(
        `[sending-worker] lead ${leadId} stage '${stage}' attempt ${job.attemptsMade + 1} failed, will retry:`,
        err,
      );
      throw err; // let BullMQ retry with backoff
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: env.EMAIL_SEND_RATE_LIMIT_MAX,
      duration: env.EMAIL_SEND_RATE_LIMIT_DURATION_MS,
    },
  },
);

sendingWorker.on('failed', (job, err) => {
  console.error(`[sending-worker] job ${job?.id} (attempt ${job?.attemptsMade}) failed:`, err);
});

sendingWorker.on('error', (err) => {
  console.error('[sending-worker] worker-level error:', err);
});
