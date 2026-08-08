import { Router } from 'express';
import {
  getSchedulerCron,
  InvalidCronError,
  updateSchedulerCron,
} from '../modules/scheduler/schedulerCronService.js';

export const settingsRouter = Router();

/** GET /api/settings/scheduler-cron — current cron pattern (DB, falling back to env.SCHEDULER_CRON). */
settingsRouter.get('/scheduler-cron', async (_req, res) => {
  try {
    const cron = await getSchedulerCron();
    res.json({ cron });
  } catch (err) {
    console.error('[settings-route] failed to read scheduler cron:', err);
    res.status(500).json({ error: 'Failed to read scheduler cron — see server logs for details' });
  }
});

/**
 * PUT /api/settings/scheduler-cron — validates, persists, and re-registers the BullMQ repeatable
 * job with the new pattern (see schedulerCronService.updateSchedulerCron — this is the actual
 * point of the feature, not just a DB write).
 */
settingsRouter.put('/scheduler-cron', async (req, res) => {
  const { cron } = req.body as { cron?: unknown };

  if (typeof cron !== 'string' || cron.trim().length === 0) {
    res.status(400).json({ error: 'cron is required' });
    return;
  }

  try {
    const saved = await updateSchedulerCron(cron);
    res.json({ cron: saved, status: 'updated' });
  } catch (err) {
    if (err instanceof InvalidCronError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[settings-route] failed to update scheduler cron:', err);
    res
      .status(500)
      .json({ error: 'Failed to update scheduler cron — see server logs for details' });
  }
});
