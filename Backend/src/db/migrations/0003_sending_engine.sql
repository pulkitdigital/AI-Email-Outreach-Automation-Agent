-- Phase 4: Email Composer and Sending Engine. See Docs/ARCHITECTURE.md § 4-5.
--
-- Adds to sent_emails_log:
--   * category_id — point-in-time snapshot of the lead's category at send time. A lead can be
--     recategorized later (Phase 2 supports this); the send log should reflect what category
--     applied when the email actually went out, not retroactively.
--   * UNIQUE (lead_id, sequence_stage) — the DB-level primitive the race-safe send-claim
--     depends on. sentEmailsLogRepository.claimSendAttempt() does
--     `INSERT ... ON CONFLICT (lead_id, sequence_stage) DO NOTHING RETURNING id`: Postgres
--     guarantees exactly one concurrent INSERT wins per (lead_id, sequence_stage), which is
--     what makes "never send the same stage twice" provable at the DB level, not just in
--     application code. This also means sent_emails_log is no longer strictly append-only
--     (Phase 0's original description) — one row now tracks a (lead, stage) send's full
--     lifecycle across retries, the same pattern already used by ingestion_jobs and
--     pitch_decks.

ALTER TABLE sent_emails_log ADD COLUMN category_id UUID REFERENCES categories (id) ON DELETE SET NULL;
CREATE INDEX idx_sent_emails_log_category_id ON sent_emails_log (category_id);

ALTER TABLE sent_emails_log ADD CONSTRAINT uq_sent_emails_log_lead_stage UNIQUE (lead_id, sequence_stage);
