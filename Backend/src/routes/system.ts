import { Router } from 'express';
import { getSystemStatus } from '../modules/systemStatus/systemStatusService.js';

export const systemRouter = Router();

/**
 * GET /api/system/status — the dashboard's System Status view (Phase 6): active email/AI
 * provider plus every failure surface already tracked by prior phases, in one place.
 */
systemRouter.get('/status', async (_req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (err) {
    console.error('[system-route] failed to compute system status:', err);
    res
      .status(500)
      .json({ error: 'Failed to compute system status — see server logs for details' });
  }
});
