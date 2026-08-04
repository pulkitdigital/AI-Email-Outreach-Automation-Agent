import { env } from '../../config/env.js';
import {
  countStoppedInRange,
  listDueFinals,
  listDueFollowups,
} from '../../db/repositories/emailSequencesRepository.js';
import { listLeadIdsByStatus } from '../../db/repositories/leadsRepository.js';
import { countSentToday } from '../../db/repositories/sentEmailsLogRepository.js';
import {
  getDayBoundsInSchedulerTimezone,
  getTodayRunDate,
  recordSchedulerRun,
} from '../../db/repositories/dailySummaryRepository.js';
import { enqueueSendEmailJob } from '../../queue/queues.js';
import { syncRepliesFromProvider } from '../replyTracking/replyTrackingService.js';

/** Same bound-by-default pattern as listLeadIdsByStatus's own default — never an unbounded scan. */
const NEW_LEAD_FETCH_LIMIT = 5000;

export interface DailySchedulerResult {
  runDate: string;
  newQueued: number;
  followupQueued: number;
  finalQueued: number;
  priorityExceededCap: boolean;
  errors: string[];
}

/**
 * The once-daily automation entry point (see Docs/ARCHITECTURE.md § 6), run as a BullMQ
 * repeatable job (queue/workers/schedulerWorker.ts) and also exposed for manual re-trigger
 * (routes/scheduler.ts, testing only). Steps run in the exact order the user specified:
 *
 *   1. reply-check sync (provider.checkReplies() — a documented no-op for Brevo, which is
 *      webhook-driven; real-time reply/bounce/unsubscribe handling already happens in
 *      routes/webhooks.ts regardless of whether this step finds anything)
 *   2. due followups   3. due finals   4. new-eligible leads
 *   5. apply the 300/day cap, followups+finals always win in full
 *   6. enqueue through the Phase 4 sending engine
 *   7. write the daily_summary audit row
 *
 * IDEMPOTENCY: every enqueue in step 6 funnels through sendSequenceEmail's claimSendAttempt()
 * (see sentEmailsLogRepository.ts), which makes a duplicate (lead, stage) enqueue a safe no-op —
 * it can never result in a duplicate send. So if this function crashes partway (e.g. after step
 * 3) and is re-run — whether by the next day's repeatable job or a manual re-trigger — it is
 * always safe to just re-run the whole thing from step 1: leads already sent today won't be
 * "due" again (their scheduled_at/sent_at columns already reflect it), and any lead re-enqueued
 * before the crash simply claims cleanly a second time and no-ops.
 */
export async function runDailyScheduler(): Promise<DailySchedulerResult> {
  const startedAt = new Date();
  const runDate = getTodayRunDate();
  const errors: string[] = [];

  const errorOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  // Step 1: reply-check sync.
  try {
    const { processed } = await syncRepliesFromProvider();
    console.log(`[scheduler] reply-check sync processed ${processed} event(s)`);
  } catch (err) {
    console.error('[scheduler] reply-check sync failed:', err);
    errors.push(`reply-sync: ${errorOf(err)}`);
  }

  // Steps 2-3: deadline-bound due leads.
  let dueFollowups: { sequenceId: string; leadId: string }[] = [];
  try {
    dueFollowups = await listDueFollowups(startedAt);
  } catch (err) {
    errors.push(`list-due-followups: ${errorOf(err)}`);
  }

  let dueFinals: { sequenceId: string; leadId: string }[] = [];
  try {
    dueFinals = await listDueFinals(startedAt);
  } catch (err) {
    errors.push(`list-due-finals: ${errorOf(err)}`);
  }

  // Step 4: new-eligible leads. 'deck_generated' status alone already means "categorized, deck
  // generated, never emailed before, not opted out/bounced/replied" — those are all mutually
  // exclusive status values (see shared/src/types/lead.ts), so no extra filtering is needed.
  let newLeadIds: string[] = [];
  try {
    newLeadIds = await listLeadIdsByStatus('deck_generated', NEW_LEAD_FETCH_LIMIT);
  } catch (err) {
    errors.push(`list-new-eligible: ${errorOf(err)}`);
  }

  // Step 5: apply the 300/day cap. followups+finals are deadline-bound and always go through in
  // full, even over cap — never silently dropped. NEW only fills whatever quota remains.
  const { dayStart, dayEnd } = getDayBoundsInSchedulerTimezone(runDate);

  let alreadyClaimedToday = 0;
  try {
    alreadyClaimedToday = await countSentToday(dayStart, dayEnd);
  } catch (err) {
    errors.push(`count-sent-today: ${errorOf(err)}`);
  }

  const priorityCount = dueFollowups.length + dueFinals.length;
  const priorityExceededCap = alreadyClaimedToday + priorityCount > env.DAILY_EMAIL_LIMIT;
  const remainingQuota = Math.max(0, env.DAILY_EMAIL_LIMIT - alreadyClaimedToday - priorityCount);

  if (priorityExceededCap) {
    const message =
      `deadline-bound sends today (${priorityCount} followup+final, ${alreadyClaimedToday} ` +
      `already claimed today) exceed DAILY_EMAIL_LIMIT (${env.DAILY_EMAIL_LIMIT}) — sending all ` +
      `of them anyway; 0 NEW emails will be queued today`;
    console.warn(`[scheduler] ${message}`);
    errors.push(message);
  }

  const newLeadIdsToQueue = newLeadIds.slice(0, remainingQuota);

  // Step 6: queue through the Phase 4 sending engine.
  let followupQueued = 0;
  for (const { leadId } of dueFollowups) {
    try {
      await enqueueSendEmailJob({ leadId, stage: 'followup' });
      followupQueued += 1;
    } catch (err) {
      errors.push(`enqueue-followup(${leadId}): ${errorOf(err)}`);
    }
  }

  let finalQueued = 0;
  for (const { leadId } of dueFinals) {
    try {
      await enqueueSendEmailJob({ leadId, stage: 'final' });
      finalQueued += 1;
    } catch (err) {
      errors.push(`enqueue-final(${leadId}): ${errorOf(err)}`);
    }
  }

  let newQueued = 0;
  for (const leadId of newLeadIdsToQueue) {
    try {
      await enqueueSendEmailJob({ leadId, stage: 'new' });
      newQueued += 1;
    } catch (err) {
      errors.push(`enqueue-new(${leadId}): ${errorOf(err)}`);
    }
  }

  // Step 7: daily summary audit row.
  let stoppedCounts = { reply: 0, bounce: 0, unsubscribe: 0 };
  try {
    stoppedCounts = await countStoppedInRange(dayStart, dayEnd);
  } catch (err) {
    errors.push(`count-stopped: ${errorOf(err)}`);
  }

  const completedAt = new Date();
  try {
    await recordSchedulerRun(runDate, {
      newQueued,
      followupQueued,
      finalQueued,
      skippedReply: stoppedCounts.reply,
      skippedBounce: stoppedCounts.bounce,
      skippedOptout: stoppedCounts.unsubscribe,
      dailyCap: env.DAILY_EMAIL_LIMIT,
      priorityExceededCap,
      errors,
      startedAt,
      completedAt,
    });
  } catch (err) {
    console.error('[scheduler] failed to record daily_summary row:', err);
  }

  console.log(
    `[scheduler] run ${runDate} complete: queued ${newQueued} new, ${followupQueued} followup, ` +
      `${finalQueued} final` +
      (errors.length ? `, ${errors.length} error(s) logged` : ''),
  );

  return { runDate, newQueued, followupQueued, finalQueued, priorityExceededCap, errors };
}
