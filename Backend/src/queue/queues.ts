import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const INGESTION_QUEUE_NAME = 'ingestion';

export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, { connection: redisConnection });

export interface IngestionUploadJobData {
  type: 'upload';
  jobId: string;
  storageKey: string;
  originalFileName: string;
}

export interface IngestionDriveJobData {
  type: 'drive';
  jobId: string;
  driveUrl: string;
}

export type IngestionJobData = IngestionUploadJobData | IngestionDriveJobData;

/**
 * Enqueues background processing for an already-created ingestion_jobs row. The API route only
 * ever gets this far — actual parsing/DB writes happen in the worker, never inline on the
 * request, per the "must run as a background job, not block the API" requirement.
 */
export async function enqueueIngestionJob(data: IngestionJobData): Promise<void> {
  await ingestionQueue.add('process', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  });
}

export const CATEGORIZATION_QUEUE_NAME = 'categorization';

export const categorizationQueue = new Queue(CATEGORIZATION_QUEUE_NAME, {
  connection: redisConnection,
});

export interface CategorizationJobData {
  leadId: string;
}

/**
 * Enqueues a categorization run for one lead. Rule-based matches resolve without any retry
 * needed (deterministic, no external call); the AI fallback path is where retries matter — see
 * Backend/src/queue/workers/categorizationWorker.ts, which retries on failure and marks the
 * lead needs_review only once attempts are exhausted, per the "never block the pipeline or
 * guess" requirement.
 */
export async function enqueueCategorizationJob(data: CategorizationJobData): Promise<void> {
  await categorizationQueue.add('categorize', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  });
}

export const DECK_GENERATION_QUEUE_NAME = 'deck-generation';

export const deckGenerationQueue = new Queue(DECK_GENERATION_QUEUE_NAME, {
  connection: redisConnection,
});

export interface DeckGenerationJobData {
  leadId: string;
  pitchDeckId: string;
}

/**
 * Enqueues rendering + upload for an already-created pitch_decks row (see
 * deckGenerationService.triggerDeckGeneration, the only place that should call this). Failures
 * here retry via backoff and, once exhausted, flag the lead for manual regeneration — see
 * Backend/src/queue/workers/deckGenerationWorker.ts.
 */
export async function enqueueDeckGenerationJob(data: DeckGenerationJobData): Promise<void> {
  await deckGenerationQueue.add('generate', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  });
}

/** Named to match the Daily Scheduler's future queue (Docs/ARCHITECTURE.md § Queue topology) — Phase 4 enqueues into it manually, the scheduler will do so automatically once built. */
export const EMAIL_SEND_QUEUE_NAME = 'email-send';

export const emailSendQueue = new Queue(EMAIL_SEND_QUEUE_NAME, { connection: redisConnection });

export interface SendEmailJobData {
  leadId: string;
  stage: 'new' | 'followup' | 'final';
  /** Feature B ("edit before sending") — when both present, bypasses composition; see sendSequenceEmail()'s `override` param. */
  composedSubject?: string;
  composedBody?: string;
}

/**
 * Enqueues one sequence-stage send for one lead. The worker (see
 * queue/workers/sendingWorker.ts) is rate-limited to respect Brevo's API limits — see
 * EMAIL_SEND_RATE_LIMIT_MAX/DURATION_MS in .env.
 */
export async function enqueueSendEmailJob(data: SendEmailJobData): Promise<void> {
  await emailSendQueue.add('send', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  });
}

/**
 * Phase 5 — the Daily Scheduler's own queue. A single repeatable job (registered via
 * upsertJobScheduler in queue/workers/schedulerWorker.ts, using SCHEDULER_CRON/SCHEDULER_TIMEZONE)
 * runs runDailyScheduler() once a day; routes/scheduler.ts's manual trigger enqueues a one-off
 * job into this same queue for testing.
 */
export const SCHEDULER_QUEUE_NAME = 'scheduler';

export const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, { connection: redisConnection });

export const DAILY_SCHEDULER_JOB_ID = 'daily-scheduler';

/** Manual/test trigger — a one-off job alongside the repeatable one, not a replacement for it. */
export async function enqueueManualSchedulerRun(): Promise<void> {
  await schedulerQueue.add(
    'run',
    { trigger: 'manual' },
    { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
  );
}
