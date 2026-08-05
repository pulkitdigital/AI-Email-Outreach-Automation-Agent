-- Phase 6: manual status override for the dashboard's Leads table (PATCH /api/leads/:id/status).
--
-- leads.status gains 4 new manually-set-only values ('contacted', 'converted', 'not_interested',
-- 'unsubscribed') alongside the existing pipeline statuses — see shared/src/types/lead.ts's
-- LeadStatus for why the existing automation-only states ('deck_generated', 'completed',
-- 'do_not_contact') are kept rather than replaced: sendingService/dailySchedulerService key off
-- 'deck_generated' exactly, sendingService sets 'completed', and unsubscribe/replyTracking set
-- 'do_not_contact' — removing or renaming any of those would silently break the send pipeline.
--
-- status_manually_set records that a human (not automation) last set the status, so
-- updateLeadStatus (Backend/src/db/repositories/leadsRepository.ts) can refuse to silently
-- overwrite a manually-set *terminal* status (converted/not_interested/unsubscribed — see
-- PROTECTED_TERMINAL_STATUSES in shared/src/types/lead.ts) when the pipeline tries to advance it.
-- Postgres auto-names an inline column CHECK as {table}_{column}_check (see 0004_scheduler.sql).

ALTER TABLE leads DROP CONSTRAINT leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
    'new',
    'needs_review',
    'categorized',
    'deck_generated',
    'in_sequence',
    'completed',
    'replied',
    'bounced',
    'do_not_contact',
    'contacted',
    'converted',
    'not_interested',
    'unsubscribed'
));

ALTER TABLE leads ADD COLUMN status_manually_set BOOLEAN NOT NULL DEFAULT false;
