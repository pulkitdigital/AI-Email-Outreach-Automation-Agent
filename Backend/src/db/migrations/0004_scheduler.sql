-- Phase 5: Deck attachment, reply/bounce/unsubscribe tracking, Daily Scheduler.
-- See Docs/ARCHITECTURE.md § 5-6.

-- ----------------------------------------------------------------------------
-- sent_emails_log: add 'cancelled' status (mid-flight abort — see sendingService.ts's
-- re-check between composeEmail() and provider.sendEmail(), the fix for the reply-during-send
-- race condition). Postgres auto-names an inline column CHECK as {table}_{column}_check.
-- ----------------------------------------------------------------------------
ALTER TABLE sent_emails_log DROP CONSTRAINT sent_emails_log_status_check;
ALTER TABLE sent_emails_log ADD CONSTRAINT sent_emails_log_status_check
    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'cancelled'));

-- ----------------------------------------------------------------------------
-- email_sequences: add 'stopped_unsubscribe' as its own terminal stage, distinct from
-- 'stopped_bounce' — an opt-out is not a delivery failure and the two should never be
-- conflated in reporting/audits.
-- ----------------------------------------------------------------------------
ALTER TABLE email_sequences DROP CONSTRAINT email_sequences_current_stage_check;
ALTER TABLE email_sequences ADD CONSTRAINT email_sequences_current_stage_check
    CHECK (current_stage IN (
        'new', 'followup', 'final',
        'completed', 'stopped_reply', 'stopped_bounce', 'stopped_unsubscribe', 'stopped_manual'
    ));

-- ----------------------------------------------------------------------------
-- Fix idx_email_sequences_followup_due / idx_email_sequences_final_due: the Phase 0 partial
-- index predicates checked current_stage = 'new' / 'followup', but markStageSent() (Phase 4)
-- advances current_stage to 'followup' / 'final' the moment the PRECEDING stage is sent — so a
-- sequence actually due for a followup send has current_stage = 'followup' (not 'new'), and one
-- due for final has current_stage = 'final' (not 'followup'). The original predicates could
-- never match a real due-for-send row. This is the first migration to actually query these
-- indexes (Daily Scheduler, Phase 5), so fix them here rather than carry the bug forward.
-- ----------------------------------------------------------------------------
DROP INDEX idx_email_sequences_followup_due;
DROP INDEX idx_email_sequences_final_due;

CREATE INDEX idx_email_sequences_followup_due
    ON email_sequences (stage_followup_scheduled_at)
    WHERE current_stage = 'followup' AND stage_followup_sent_at IS NULL;
CREATE INDEX idx_email_sequences_final_due
    ON email_sequences (stage_final_scheduled_at)
    WHERE current_stage = 'final' AND stage_final_sent_at IS NULL;

-- ----------------------------------------------------------------------------
-- daily_summary: one row per scheduler run date, for audit. Tracks QUEUED counts (known
-- synchronously when the scheduler enqueues jobs) and live SENT/FAILED/CANCELLED counts
-- (incremented by sendingService.sendSequenceEmail's own success/failure/cancel paths for any
-- send that lands on that calendar date, whether scheduler- or manually-triggered — the
-- scheduler cannot know final delivery outcomes synchronously, so this table is honest about
-- being a running tally, not a one-shot snapshot). UNIQUE(run_date) plus upsert-on-conflict
-- is what makes a crashed-and-rerun scheduler job idempotent for summary logging.
-- ----------------------------------------------------------------------------
CREATE TABLE daily_summary (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date                    DATE NOT NULL UNIQUE,
    new_queued                  INTEGER NOT NULL DEFAULT 0,
    followup_queued             INTEGER NOT NULL DEFAULT 0,
    final_queued                INTEGER NOT NULL DEFAULT 0,
    new_sent                    INTEGER NOT NULL DEFAULT 0,
    followup_sent               INTEGER NOT NULL DEFAULT 0,
    final_sent                  INTEGER NOT NULL DEFAULT 0,
    failed_count                INTEGER NOT NULL DEFAULT 0,
    cancelled_count             INTEGER NOT NULL DEFAULT 0,
    skipped_reply               INTEGER NOT NULL DEFAULT 0,
    skipped_bounce              INTEGER NOT NULL DEFAULT 0,
    skipped_optout              INTEGER NOT NULL DEFAULT 0,
    daily_cap                   INTEGER NOT NULL DEFAULT 300,
    priority_exceeded_cap       BOOLEAN NOT NULL DEFAULT false,
    scheduler_errors            JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_daily_summary_updated_at BEFORE UPDATE ON daily_summary
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
