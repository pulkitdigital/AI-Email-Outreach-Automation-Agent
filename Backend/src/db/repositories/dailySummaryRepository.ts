import { pool } from '../pool.js';
import { env } from '../../config/env.js';
import type { SendableStage } from './emailSequencesRepository.js';

export interface DailySummaryRecord {
  id: string;
  runDate: string; // YYYY-MM-DD
  newQueued: number;
  followupQueued: number;
  finalQueued: number;
  newSent: number;
  followupSent: number;
  finalSent: number;
  failedCount: number;
  cancelledCount: number;
  skippedReply: number;
  skippedBounce: number;
  skippedOptout: number;
  dailyCap: number;
  priorityExceededCap: boolean;
  schedulerErrors: string[];
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SUMMARY_COLUMNS = `
  id, run_date AS "runDate", new_queued AS "newQueued", followup_queued AS "followupQueued",
  final_queued AS "finalQueued", new_sent AS "newSent", followup_sent AS "followupSent",
  final_sent AS "finalSent", failed_count AS "failedCount", cancelled_count AS "cancelledCount",
  skipped_reply AS "skippedReply", skipped_bounce AS "skippedBounce",
  skipped_optout AS "skippedOptout", daily_cap AS "dailyCap",
  priority_exceeded_cap AS "priorityExceededCap", scheduler_errors AS "schedulerErrors",
  started_at AS "startedAt", completed_at AS "completedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

/**
 * "Today" in SCHEDULER_TIMEZONE, as YYYY-MM-DD — the day boundary the scheduler's due-date math
 * and this table's run_date both key off, independent of the server host's local timezone.
 * en-CA locale formatting conveniently emits ISO order (YYYY-MM-DD).
 */
export function formatRunDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.SCHEDULER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getTodayRunDate(): string {
  return formatRunDate(new Date());
}

/** e.g. "+05:30" from Intl's 'longOffset' ("GMT+05:30") — "+00:00" fallback covers UTC's bare "GMT". */
function getUtcOffsetString(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  const match = part?.value.match(/GMT([+-]\d{2}:\d{2})/);
  return match?.[1] ?? '+00:00';
}

/**
 * [dayStart, dayEnd) as real UTC instants bounding midnight-to-midnight of `runDate` in
 * SCHEDULER_TIMEZONE — used for the daily send cap (countSentToday) and the stopped-sequence
 * audit counts (countStoppedInRange), so "today" always means the same calendar day the
 * scheduler's own due-date math uses, not the host server's local day. The offset is resolved
 * from a fixed midday-UTC instant on that date (safely inside the same local calendar day for
 * any real-world timezone) rather than from `new Date()`, so this is stable to call at any time
 * of day; the one accepted imprecision is a rare DST-transition day in a DST-observing zone
 * being off by an hour, which only affects a daily send-cap boundary, not correctness of any
 * individual send.
 */
export function getDayBoundsInSchedulerTimezone(runDate: string): { dayStart: Date; dayEnd: Date } {
  const offset = getUtcOffsetString(new Date(`${runDate}T12:00:00Z`), env.SCHEDULER_TIMEZONE);
  const dayStart = new Date(`${runDate}T00:00:00${offset}`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

export async function getDailySummary(runDate: string): Promise<DailySummaryRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${SUMMARY_COLUMNS} FROM daily_summary WHERE run_date = $1`,
    [runDate],
  );
  return (rows[0] as DailySummaryRecord | undefined) ?? null;
}

/** The dashboard's Daily Summary trend view (Phase 6) — last `days` calendar days, oldest first, for charting. */
export async function listDailySummaries(days: number): Promise<DailySummaryRecord[]> {
  const { rows } = await pool.query(
    `SELECT ${SUMMARY_COLUMNS} FROM daily_summary
     ORDER BY run_date DESC
     LIMIT $1`,
    [days],
  );
  return (rows as DailySummaryRecord[]).reverse();
}

export interface SchedulerRunPatch {
  newQueued: number;
  followupQueued: number;
  finalQueued: number;
  skippedReply: number;
  skippedBounce: number;
  skippedOptout: number;
  dailyCap: number;
  priorityExceededCap: boolean;
  errors: string[];
  startedAt: Date;
  completedAt: Date;
}

/**
 * Records one scheduler run's own view of the day: what it queued/skipped and any errors it hit.
 * Upserts by run_date with SET semantics (not increment) — if the scheduler is re-run later the
 * same day (e.g. after a crash, or a manual re-trigger), the fresh run's queued/skipped counts
 * simply overwrite the prior snapshot for that date, since a re-run recomputes the due-lead
 * queries from scratch (already-claimed sends won't be re-identified as due — see
 * sentEmailsLogRepository.claimSendAttempt). Sent/failed/cancelled counts are NOT touched here —
 * see incrementSentCount/incrementFailedCount/incrementCancelledCount below, which accumulate
 * independently as sends actually resolve.
 */
export async function recordSchedulerRun(
  runDate: string,
  patch: SchedulerRunPatch,
): Promise<DailySummaryRecord> {
  const { rows } = await pool.query(
    `INSERT INTO daily_summary (
       run_date, new_queued, followup_queued, final_queued,
       skipped_reply, skipped_bounce, skipped_optout, daily_cap, priority_exceeded_cap,
       scheduler_errors, started_at, completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (run_date) DO UPDATE SET
       new_queued = EXCLUDED.new_queued,
       followup_queued = EXCLUDED.followup_queued,
       final_queued = EXCLUDED.final_queued,
       skipped_reply = EXCLUDED.skipped_reply,
       skipped_bounce = EXCLUDED.skipped_bounce,
       skipped_optout = EXCLUDED.skipped_optout,
       daily_cap = EXCLUDED.daily_cap,
       priority_exceeded_cap = EXCLUDED.priority_exceeded_cap,
       scheduler_errors = EXCLUDED.scheduler_errors,
       started_at = EXCLUDED.started_at,
       completed_at = EXCLUDED.completed_at
     RETURNING ${SUMMARY_COLUMNS}`,
    [
      runDate,
      patch.newQueued,
      patch.followupQueued,
      patch.finalQueued,
      patch.skippedReply,
      patch.skippedBounce,
      patch.skippedOptout,
      patch.dailyCap,
      patch.priorityExceededCap,
      JSON.stringify(patch.errors),
      patch.startedAt,
      patch.completedAt,
    ],
  );
  return rows[0] as DailySummaryRecord;
}

const SENT_COLUMN_BY_STAGE: Record<SendableStage, string> = {
  new: 'new_sent',
  followup: 'followup_sent',
  final: 'final_sent',
};

/**
 * Called by sendingService on every successful send that resolves "today" (SCHEDULER_TIMEZONE),
 * whether triggered by the scheduler or a manual send-now — see dailySummaryRepository's module
 * doc and Docs/ARCHITECTURE.md § 6 for why this table tracks live outcomes rather than a
 * scheduler-time snapshot. Upserts the row into existence so a send that happens to be the first
 * event of the day doesn't require the scheduler to have run first.
 */
export async function incrementSentCount(runDate: string, stage: SendableStage): Promise<void> {
  const column = SENT_COLUMN_BY_STAGE[stage];
  await pool.query(
    `INSERT INTO daily_summary (run_date, ${column}) VALUES ($1, 1)
     ON CONFLICT (run_date) DO UPDATE SET ${column} = daily_summary.${column} + 1`,
    [runDate],
  );
}

export async function incrementFailedCount(runDate: string): Promise<void> {
  await pool.query(
    `INSERT INTO daily_summary (run_date, failed_count) VALUES ($1, 1)
     ON CONFLICT (run_date) DO UPDATE SET failed_count = daily_summary.failed_count + 1`,
    [runDate],
  );
}

export async function incrementCancelledCount(runDate: string): Promise<void> {
  await pool.query(
    `INSERT INTO daily_summary (run_date, cancelled_count) VALUES ($1, 1)
     ON CONFLICT (run_date) DO UPDATE SET cancelled_count = daily_summary.cancelled_count + 1`,
    [runDate],
  );
}
