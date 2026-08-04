import type { SequenceStage } from '@bebeyond/shared';
import { pool } from '../pool.js';

/** The 3 stages the sending engine actually sends for — SequenceStage's terminal states ('completed', 'stopped_*') are never a send target. */
export type SendableStage = 'new' | 'followup' | 'final';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EmailSequenceRecord {
  id: string;
  leadId: string;
  pitchDeckId: string | null;
  currentStage: SequenceStage;
  stageNewSentAt: Date | null;
  stageFollowupScheduledAt: Date | null;
  stageFollowupSentAt: Date | null;
  stageFinalScheduledAt: Date | null;
  stageFinalSentAt: Date | null;
  stoppedReason: string | null;
  stoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SEQUENCE_COLUMNS = `
  id, lead_id AS "leadId", pitch_deck_id AS "pitchDeckId", current_stage AS "currentStage",
  stage_new_sent_at AS "stageNewSentAt",
  stage_followup_scheduled_at AS "stageFollowupScheduledAt", stage_followup_sent_at AS "stageFollowupSentAt",
  stage_final_scheduled_at AS "stageFinalScheduledAt", stage_final_sent_at AS "stageFinalSentAt",
  stopped_reason AS "stoppedReason", stopped_at AS "stoppedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function getSequenceForLead(leadId: string): Promise<EmailSequenceRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${SEQUENCE_COLUMNS} FROM email_sequences WHERE lead_id = $1`,
    [leadId],
  );
  return (rows[0] as EmailSequenceRecord | undefined) ?? null;
}

/**
 * A lead gets at most one email_sequences row, ever (UNIQUE(lead_id) from Phase 0) — created
 * lazily on the first send attempt (always the 'new' stage) rather than eagerly at
 * categorization/deck-generation time, since Phase 4 doesn't wire up the scheduler yet and
 * there's nothing useful to track before a send is actually attempted.
 */
export async function getOrCreateSequenceForLead(leadId: string): Promise<EmailSequenceRecord> {
  const inserted = await pool.query(
    `INSERT INTO email_sequences (lead_id) VALUES ($1)
     ON CONFLICT (lead_id) DO NOTHING
     RETURNING ${SEQUENCE_COLUMNS}`,
    [leadId],
  );
  if (inserted.rows[0]) return inserted.rows[0] as EmailSequenceRecord;

  const existing = await getSequenceForLead(leadId);
  if (!existing) {
    // Practically unreachable (insert conflicted, so a row must exist) — but never assume.
    throw new Error(`Failed to get or create email sequence for lead ${leadId}`);
  }
  return existing;
}

/**
 * Records a confirmed successful send and advances the sequence. Sending 'new' also computes
 * and stores both future stages' scheduled_at columns up front (day 3 / day 7 from THIS send),
 * per Docs/DATABASE_SCHEMA.md § email_sequences — so the (future) Daily Scheduler only ever
 * needs to compare scheduled_at <= now(), never recompute anything.
 */
export async function markStageSent(
  sequenceId: string,
  stage: SendableStage,
  sentAt: Date,
): Promise<void> {
  if (stage === 'new') {
    const followupScheduledAt = new Date(sentAt.getTime() + 3 * DAY_MS);
    const finalScheduledAt = new Date(sentAt.getTime() + 7 * DAY_MS);
    await pool.query(
      `UPDATE email_sequences SET
         stage_new_sent_at = $2,
         current_stage = 'followup',
         stage_followup_scheduled_at = $3,
         stage_final_scheduled_at = $4
       WHERE id = $1`,
      [sequenceId, sentAt, followupScheduledAt, finalScheduledAt],
    );
    return;
  }

  if (stage === 'followup') {
    await pool.query(
      `UPDATE email_sequences SET stage_followup_sent_at = $2, current_stage = 'final' WHERE id = $1`,
      [sequenceId, sentAt],
    );
    return;
  }

  await pool.query(
    `UPDATE email_sequences SET stage_final_sent_at = $2, current_stage = 'completed' WHERE id = $1`,
    [sequenceId, sentAt],
  );
}

export type StopStage =
  'stopped_reply' | 'stopped_bounce' | 'stopped_unsubscribe' | 'stopped_manual';

const TERMINAL_STAGES: SequenceStage[] = [
  'completed',
  'stopped_reply',
  'stopped_bounce',
  'stopped_unsubscribe',
  'stopped_manual',
];

/**
 * Stops a lead's sequence permanently — no further followup/final send is ever due again, since
 * listDueFollowups/listDueFinals below only select current_stage IN ('followup', 'final').
 * Idempotent: a lead already in ANY terminal stage (completed or already stopped for a different
 * reason) is left untouched, so a duplicate webhook delivery or a reply arriving after a bounce
 * was already recorded can't overwrite an earlier terminal reason. No-ops harmlessly (0 rows
 * affected) if the lead has no email_sequences row yet — leads.status is the gate that matters
 * in that case (see sendingService's ELIGIBLE_STATUSES_BY_STAGE check).
 */
export async function stopSequenceForLead(
  leadId: string,
  stage: StopStage,
  reason: string,
): Promise<void> {
  await pool.query(
    `UPDATE email_sequences SET current_stage = $2, stopped_reason = $3, stopped_at = now()
     WHERE lead_id = $1 AND current_stage != ALL($4::text[])`,
    [leadId, stage, reason, TERMINAL_STAGES],
  );
}

export interface DueSequenceRecord {
  sequenceId: string;
  leadId: string;
}

/**
 * Leads whose 'followup' send is due today or earlier. Relies on
 * idx_email_sequences_followup_due (see migrations/0004_scheduler.sql — the Phase 0 predicate
 * was wrong; markStageSent already advances current_stage to 'followup' the moment 'new' is
 * sent, so that's the correct predicate here, not 'new').
 */
export async function listDueFollowups(asOf: Date): Promise<DueSequenceRecord[]> {
  const { rows } = await pool.query<DueSequenceRecord>(
    `SELECT id AS "sequenceId", lead_id AS "leadId"
     FROM email_sequences
     WHERE current_stage = 'followup'
       AND stage_followup_sent_at IS NULL
       AND stage_followup_scheduled_at <= $1
     ORDER BY stage_followup_scheduled_at ASC`,
    [asOf],
  );
  return rows;
}

/** Leads whose 'final' send is due today or earlier (day 7 from the ORIGINAL 'new' send — stage_final_scheduled_at is computed from that, never recomputed from the followup send). */
export async function listDueFinals(asOf: Date): Promise<DueSequenceRecord[]> {
  const { rows } = await pool.query<DueSequenceRecord>(
    `SELECT id AS "sequenceId", lead_id AS "leadId"
     FROM email_sequences
     WHERE current_stage = 'final'
       AND stage_final_sent_at IS NULL
       AND stage_final_scheduled_at <= $1
     ORDER BY stage_final_scheduled_at ASC`,
    [asOf],
  );
  return rows;
}

export interface StoppedCounts {
  reply: number;
  bounce: number;
  unsubscribe: number;
}

/**
 * Counts sequences that dropped out of the pipeline in [rangeStart, rangeEnd) by reason — feeds
 * the Daily Scheduler's "skipped due to reply/bounce/optout" summary line. Deliberately counts
 * every stop event in the window (not just ones that happened to coincide with a followup/final
 * due date) — listDueFollowups/listDueFinals already silently exclude stopped sequences from
 * their own results, so this is the only place that surfaces those exclusions for the audit log.
 */
export async function countStoppedInRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<StoppedCounts> {
  const { rows } = await pool.query<{ currentStage: string; count: string }>(
    `SELECT current_stage AS "currentStage", COUNT(*)::text AS count
     FROM email_sequences
     WHERE stopped_at >= $1 AND stopped_at < $2
       AND current_stage IN ('stopped_reply', 'stopped_bounce', 'stopped_unsubscribe')
     GROUP BY current_stage`,
    [rangeStart, rangeEnd],
  );

  const counts: StoppedCounts = { reply: 0, bounce: 0, unsubscribe: 0 };
  for (const row of rows) {
    if (row.currentStage === 'stopped_reply') counts.reply = Number(row.count);
    else if (row.currentStage === 'stopped_bounce') counts.bounce = Number(row.count);
    else if (row.currentStage === 'stopped_unsubscribe') counts.unsubscribe = Number(row.count);
  }
  return counts;
}
