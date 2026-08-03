import { Router } from 'express';
import { listDailySummaries } from '../db/repositories/dailySummaryRepository.js';
import { enqueueManualSchedulerRun } from '../queue/queues.js';

export const schedulerRouter = Router();

/** GET /api/scheduler/daily-summary?days=30 — trend data for the dashboard's Daily Summary view (Phase 6). Oldest first. */
schedulerRouter.get('/daily-summary', async (req, res) => {
  const daysParam = Number(req.query.days);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

  try {
    const summaries = await listDailySummaries(days);
    res.json(summaries);
  } catch (err) {
    console.error('[scheduler-route] failed to list daily summaries:', err);
    res.status(500).json({ error: 'Failed to list daily summaries — see server logs for details' });
  }
});

/**
 * POST /api/scheduler/run-now — manual re-trigger of the Daily Scheduler, for testing only. The
 * automated repeatable job (registered at worker startup — see queue/startWorkers.ts) is what
 * makes normal day-to-day operation require zero manual intervention; this endpoint exists
 * purely so the scheduler's behavior can be exercised on demand without waiting for the next
 * scheduled run, exactly the same way POST /api/sending/leads/:id/send-now exists for Phase 4.
 */
schedulerRouter.post('/run-now', async (_req, res) => {
  try {
    await enqueueManualSchedulerRun();
    res.status(202).json({ status: 'queued' });
  } catch (err) {
    console.error('[scheduler-route] failed to enqueue manual scheduler run:', err);
    res
      .status(500)
      .json({ error: 'Failed to enqueue scheduler run — see server logs for details' });
  }
});
