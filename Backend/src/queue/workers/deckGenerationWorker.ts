import { Worker, type Job } from 'bullmq';
import {
  generateDeckForLead,
  markDeckGenerationFailed,
} from '../../modules/deckGeneration/deckGenerationService.js';
import { DeckGenerationPreconditionError } from '../../modules/deckGeneration/errors.js';
import { redisConnection } from '../connection.js';
import { DECK_GENERATION_QUEUE_NAME, type DeckGenerationJobData } from '../queues.js';

/**
 * concurrency: 2 — reverted from a temporary concurrency: 1 that existed solely because every job
 * used to shell out to `soffice --headless --convert-to pdf` (pptxToPdf.ts), and LibreOffice's
 * per-process memory footprint made running two at once the single biggest avoidable spike in
 * this service's peak memory usage (see render.yaml's comment on bebeyond-backend-worker's plan
 * for the original numbers). Deck generation is now pure JS (@react-pdf/renderer — see
 * pdf/generateDeckPdf.ts): no native subprocess, no comparable memory spike, so there's no longer
 * a reason to serialize jobs that otherwise target distinct leads with no shared-row contention.
 * Matches categorizationWorker's precedent of running independent per-lead jobs concurrently.
 */
export const deckGenerationWorker = new Worker<DeckGenerationJobData>(
  DECK_GENERATION_QUEUE_NAME,
  async (job: Job<DeckGenerationJobData>) => {
    const { leadId, pitchDeckId } = job.data;

    try {
      await generateDeckForLead(leadId, pitchDeckId);
    } catch (err) {
      if (err instanceof DeckGenerationPreconditionError) {
        // A lead with no category can't ever produce a deck by retrying — don't burn the backoff window.
        console.error(`[deck-worker] lead ${leadId} failed precondition, skipping retries:`, err);
        await markDeckGenerationFailed(leadId);
        return;
      }

      const attemptsAllowed = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

      if (isFinalAttempt) {
        console.error(
          `[deck-worker] lead ${leadId} (pitchDeck ${pitchDeckId}) failed after ${attemptsAllowed} attempt(s), flagging for manual regeneration:`,
          err,
        );
        await markDeckGenerationFailed(leadId);
        return;
      }

      console.warn(
        `[deck-worker] lead ${leadId} (pitchDeck ${pitchDeckId}) attempt ${job.attemptsMade + 1} failed, will retry:`,
        err,
      );
      throw err; // let BullMQ retry with backoff
    }
  },
  { connection: redisConnection, concurrency: 2 },
);

deckGenerationWorker.on('failed', (job, err) => {
  console.error(`[deck-worker] job ${job?.id} (attempt ${job?.attemptsMade}) failed:`, err);
});

deckGenerationWorker.on('error', (err) => {
  console.error('[deck-worker] worker-level error:', err);
});
