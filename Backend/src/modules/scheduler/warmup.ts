import { env } from '../../config/env.js';

/**
 * Sending-domain warm-up ramp (bebeyond.digital has no prior sending history, so a flat
 * DAILY_EMAIL_LIMIT from day one is a deliverability risk). Deliberately a PURE function of
 * (runDate, env config) — no DB row, no counter, no persisted "day N of warmup" state at all.
 * That's what makes it trivially resumable/idempotent, consistent with the rest of the Phase 5
 * scheduler's design (see dailySchedulerService.ts's own idempotency note): the same calendar
 * date always produces the same effective limit, so a process restart mid-day, a crashed-and-
 * rerun scheduler job, or a manual re-trigger can never desync the ramp from reality — there's
 * nothing to desync.
 *
 * Formula: WARMUP_START_LIMIT * WARMUP_GROWTH_RATE ^ floor(daysSinceStart / WARMUP_GROWTH_INTERVAL_DAYS),
 * capped at DAILY_EMAIL_LIMIT once the ramp reaches (or would exceed) it.
 */
export function computeEffectiveDailyLimit(runDate: string): number {
  if (!env.WARMUP_ENABLED) {
    return env.DAILY_EMAIL_LIMIT;
  }

  if (!env.WARMUP_START_DATE) {
    console.warn(
      '[warmup] WARMUP_ENABLED is true but WARMUP_START_DATE is not set — falling back to the full DAILY_EMAIL_LIMIT',
    );
    return env.DAILY_EMAIL_LIMIT;
  }

  const daysSinceStart = Math.floor(
    (Date.parse(`${runDate}T00:00:00Z`) - Date.parse(`${env.WARMUP_START_DATE}T00:00:00Z`)) /
      86_400_000,
  );

  // WARMUP_START_DATE in the future (ramp not started yet) — treat as day 0, never below the
  // starting limit and never above the configured ceiling.
  if (daysSinceStart < 0) {
    return Math.min(env.WARMUP_START_LIMIT, env.DAILY_EMAIL_LIMIT);
  }

  const stepsElapsed = Math.floor(daysSinceStart / env.WARMUP_GROWTH_INTERVAL_DAYS);
  const rampedLimit = Math.floor(env.WARMUP_START_LIMIT * env.WARMUP_GROWTH_RATE ** stepsElapsed);

  return Math.min(rampedLimit, env.DAILY_EMAIL_LIMIT);
}
