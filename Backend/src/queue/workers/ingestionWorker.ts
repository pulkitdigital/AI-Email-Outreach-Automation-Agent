import { Worker, type Job } from 'bullmq';
import {
  completeIngestionJob,
  getIngestionJobById,
  markIngestionJobStarted,
  resetIngestionJobCounters,
} from '../../db/repositories/ingestionJobsRepository.js';
import { runDriveIngestionJob } from '../../modules/ingestion/driveIngestion.js';
import { expandToLeafFiles, processLeafFile } from '../../modules/ingestion/pipeline.js';
import { getStorageProvider } from '../../storage/index.js';
import { redisConnection } from '../connection.js';
import {
  INGESTION_QUEUE_NAME,
  type IngestionJobData,
  type IngestionUploadJobData,
} from '../queues.js';

async function processUploadJob(data: IngestionUploadJobData): Promise<void> {
  const storage = getStorageProvider();
  const buffer = await storage.getObject(data.storageKey);

  const { files, warnings } = expandToLeafFiles(data.originalFileName, buffer);
  for (const warning of warnings) console.warn(`[ingestion] job=${data.jobId} ${warning}`);

  await markIngestionJobStarted(data.jobId, files.length);

  for (const file of files) {
    await processLeafFile(data.jobId, file.path, file.buffer);
  }

  try {
    await storage.deleteObject(data.storageKey);
  } catch (err) {
    // Cleanup failure is not a reason to fail an otherwise-successful ingestion run.
    console.warn(
      `[ingestion] job=${data.jobId} failed to clean up staged upload ${data.storageKey}:`,
      err,
    );
  }
}

/** Derives a final status from what actually happened — never left as 'processing' either way. */
async function finalizeJobStatus(jobId: string): Promise<void> {
  const job = await getIngestionJobById(jobId);
  if (!job) return;

  const leadsWritten = job.totalLeadsCreated + job.totalLeadsMerged;
  const status = job.totalErrors === 0 ? 'completed' : leadsWritten > 0 ? 'partial' : 'failed';

  await completeIngestionJob(jobId, status);
}

/**
 * Single worker for both upload- and Drive-sourced ingestion jobs — the two job types converge
 * on the same processLeafFile()/leadWriter path once files are in hand, so one queue/worker
 * keeps that shared logic in one place. concurrency: 1 is deliberate: it avoids two workers
 * racing to merge the same duplicate email at once, without needing per-lead locking beyond the
 * SELECT ... FOR UPDATE already in leadsRepository.upsertLead.
 */
export const ingestionWorker = new Worker<IngestionJobData>(
  INGESTION_QUEUE_NAME,
  async (job: Job<IngestionJobData>) => {
    const { data } = job;
    console.log(
      `[ingestion-worker] starting job ${data.jobId} (${data.type}), attempt ${job.attemptsMade + 1}`,
    );

    await resetIngestionJobCounters(data.jobId);

    try {
      if (data.type === 'upload') {
        await processUploadJob(data);
      } else {
        await runDriveIngestionJob(data.jobId, data.driveUrl);
      }
      await finalizeJobStatus(data.jobId);
    } catch (err) {
      console.error(`[ingestion-worker] job ${data.jobId} failed fatally:`, err);
      await completeIngestionJob(data.jobId, 'failed');
      throw err; // rethrow so BullMQ applies its retry/backoff policy
    }
  },
  { connection: redisConnection, concurrency: 1 },
);

ingestionWorker.on('failed', (job, err) => {
  console.error(`[ingestion-worker] job ${job?.id} (attempt ${job?.attemptsMade}) failed:`, err);
});

ingestionWorker.on('error', (err) => {
  console.error('[ingestion-worker] worker-level error:', err);
});
