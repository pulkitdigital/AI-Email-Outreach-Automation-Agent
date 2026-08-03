import { Router } from 'express';
import multer from 'multer';
import type { IngestionJobProgress, IngestionSourceType } from '@bebeyond/shared';
import { env } from '../config/env.js';
import {
  createIngestionJob,
  getIngestionJobById,
  listRecentIngestionJobs,
  type IngestionJobRecord,
} from '../db/repositories/ingestionJobsRepository.js';
import { extractDriveIdFromUrl } from '../integrations/googleDrive/driveClient.js';
import { enqueueIngestionJob } from '../queue/queues.js';
import { getStorageProvider } from '../storage/index.js';

export const ingestionRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024 },
});

const SUPPORTED_UPLOAD_EXTENSIONS: Record<string, IngestionSourceType> = {
  zip: 'zip',
  pdf: 'pdf',
  csv: 'csv',
  xlsx: 'xlsx',
};

function detectUploadSourceType(fileName: string): IngestionSourceType | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_UPLOAD_EXTENSIONS[ext] ?? null;
}

function toProgress(job: IngestionJobRecord): IngestionJobProgress {
  return {
    id: job.id,
    sourceType: job.sourceType,
    sourceReference: job.sourceReference,
    status: job.status,
    totalFilesDiscovered: job.totalFilesDiscovered,
    filesProcessed: job.filesProcessed,
    totalRowsFound: job.totalRowsFound,
    totalLeadsCreated: job.totalLeadsCreated,
    totalLeadsMerged: job.totalLeadsMerged,
    totalRowsFlaggedForReview: job.totalRowsFlaggedForReview,
    totalErrors: job.totalErrors,
    errorDetails: job.errorDetails,
    reviewItems: job.reviewItems,
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  };
}

/**
 * POST /api/ingestion/upload — multipart file upload (field name "file"). Accepts ZIP, PDF,
 * CSV, XLSX. Stages the file via the storage abstraction (R2 in production, local disk in
 * dev — see Backend/src/storage) and enqueues a BullMQ job; actual parsing happens in the
 * worker, never inline here, so the request returns immediately.
 */
ingestionRouter.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[ingestion-route] upload failed at multer stage:', err);
      res.status(400).json({ error: err.message ?? 'File upload failed' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file provided (expected multipart field "file")' });
      return;
    }

    const sourceType = detectUploadSourceType(req.file.originalname);
    if (!sourceType) {
      res.status(400).json({
        error: `Unsupported file type for "${req.file.originalname}" — expected .zip, .pdf, .csv, or .xlsx`,
      });
      return;
    }

    try {
      const job = await createIngestionJob({
        sourceType,
        sourceReference: req.file.originalname,
      });

      const storageKey = `ingestion-uploads/${job.id}/${req.file.originalname}`;
      const storage = getStorageProvider();
      await storage.putObject(storageKey, req.file.buffer, req.file.mimetype);

      await enqueueIngestionJob({
        type: 'upload',
        jobId: job.id,
        storageKey,
        originalFileName: req.file.originalname,
      });

      res.status(202).json({ jobId: job.id, status: 'pending' });
    } catch (uploadErr) {
      console.error(
        `[ingestion-route] failed to stage upload "${req.file.originalname}":`,
        uploadErr,
      );
      res.status(500).json({ error: 'Failed to accept upload — see server logs for details' });
    }
  });
});

/**
 * POST /api/ingestion/drive — { url: string }. Validates the link resolves to a Drive file/
 * folder ID before creating a job, then enqueues background traversal (see driveIngestion.ts).
 * Auth is a pre-shared service account (see Docs/ARCHITECTURE.md) — the caller only ever
 * supplies a link, never credentials.
 */
ingestionRouter.post('/drive', async (req, res) => {
  const url: unknown = req.body?.url;

  if (typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "url" field' });
    return;
  }

  try {
    extractDriveIdFromUrl(url);
  } catch {
    res.status(400).json({ error: `Could not parse a Google Drive file/folder ID from: ${url}` });
    return;
  }

  try {
    const job = await createIngestionJob({ sourceType: 'gdrive', sourceReference: url });

    await enqueueIngestionJob({ type: 'drive', jobId: job.id, driveUrl: url });

    res.status(202).json({ jobId: job.id, status: 'pending' });
  } catch (err) {
    console.error(`[ingestion-route] failed to create Drive ingestion job for ${url}:`, err);
    res.status(500).json({ error: 'Failed to accept Drive link — see server logs for details' });
  }
});

ingestionRouter.get('/jobs/:id', async (req, res) => {
  try {
    const job = await getIngestionJobById(req.params.id);
    if (!job) {
      res.status(404).json({ error: `Ingestion job not found: ${req.params.id}` });
      return;
    }
    res.json(toProgress(job));
  } catch (err) {
    console.error(`[ingestion-route] failed to fetch job ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to fetch ingestion job — see server logs for details' });
  }
});

ingestionRouter.get('/jobs', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const jobs = await listRecentIngestionJobs(Number.isFinite(limit) ? limit : 50);
    res.json(jobs.map(toProgress));
  } catch (err) {
    console.error('[ingestion-route] failed to list jobs:', err);
    res.status(500).json({ error: 'Failed to list ingestion jobs — see server logs for details' });
  }
});
