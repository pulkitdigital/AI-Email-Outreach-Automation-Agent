import { Router } from 'express';
import {
  getSchedulerCron,
  InvalidCronError,
  updateSchedulerCron,
} from '../modules/scheduler/schedulerCronService.js';
import {
  getSenderIdentity,
  InvalidSenderIdentityError,
  updateSenderIdentity,
} from '../modules/senderIdentity/senderIdentityService.js';

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

/** GET /api/settings/sender-identity — current name/designation/company (DB, falling back to env/hardcoded defaults). */
settingsRouter.get('/sender-identity', async (_req, res) => {
  try {
    const identity = await getSenderIdentity();
    res.json(identity);
  } catch (err) {
    console.error('[settings-route] failed to read sender identity:', err);
    res
      .status(500)
      .json({ error: 'Failed to read sender identity — see server logs for details' });
  }
});

/**
 * PUT /api/settings/sender-identity — validates, persists, and refreshes the cache the composer/
 * BrevoProvider read from (see senderIdentityService.updateSenderIdentity).
 */
settingsRouter.put('/sender-identity', async (req, res) => {
  const { name, designation, companyName } = req.body as {
    name?: unknown;
    designation?: unknown;
    companyName?: unknown;
  };

  if (
    typeof name !== 'string' ||
    typeof designation !== 'string' ||
    typeof companyName !== 'string'
  ) {
    res.status(400).json({ error: 'name, designation, and companyName are all required strings' });
    return;
  }

  try {
    const saved = await updateSenderIdentity({ name, designation, companyName });
    res.json({ ...saved, status: 'updated' });
  } catch (err) {
    if (err instanceof InvalidSenderIdentityError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[settings-route] failed to update sender identity:', err);
    res
      .status(500)
      .json({ error: 'Failed to update sender identity — see server logs for details' });
  }
});
