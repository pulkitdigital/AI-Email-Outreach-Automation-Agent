import { env } from '../../config/env.js';

/**
 * Random per-job delay (ms), for spreading a day's scheduler-enqueued sends across
 * SEND_SPREAD_WINDOW_HOURS instead of firing them all back-to-back at SCHEDULER_CRON time —
 * see EnqueueSendEmailJobOptions.delayMs (queue/queues.ts) and dailySchedulerService.ts's step
 * 6. Uniform random across the whole window (not a fixed per-job increment), so the resulting
 * send timestamps don't themselves form a suspiciously regular pattern — real, human-paced
 * sending isn't evenly spaced either. Independent of EMAIL_SEND_RATE_LIMIT_MAX/DURATION_MS,
 * which still governs how fast jobs drain once each one's delay has elapsed and it's actually
 * eligible to run — this only changes when a job joins that front of the queue.
 */
export function computeSendSpreadDelayMs(): number {
  const windowMs = env.SEND_SPREAD_WINDOW_HOURS * 60 * 60 * 1000;
  if (!Number.isFinite(windowMs) || windowMs <= 0) return 0;
  return Math.floor(Math.random() * windowMs);
}
