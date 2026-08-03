-- Initial schema. See Docs/DATABASE_SCHEMA.md for the annotated design rationale.
--
-- Phase 1 amendments to the Phase 0 doc (kept in sync there too):
--   * leads.status gains 'needs_review'; leads gains review_reason + extraction_confidence.
--   * ingestion_jobs gains files_processed, total_leads_merged (replaces the vaguer
--     total_duplicates_skipped — Phase 1 actively merges duplicates, it doesn't just skip
--     them), total_rows_flagged_for_review, and review_items (parallel to error_details, for
--     rows that could not become a lead row at all, e.g. unstructured PDF text with no email).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- categories
-- ============================================================================
CREATE TABLE categories (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL,
    service_group       TEXT
                         CHECK (service_group IN (
                             'digital_marketing',
                             'web_app_solutions',
                             'creative_services',
                             'marketplace_commerce'
                         )),
    criteria            JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (slug)
);
CREATE INDEX idx_categories_service_group ON categories (service_group);
CREATE INDEX idx_categories_criteria_gin ON categories USING GIN (criteria);
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ingestion_jobs
-- ============================================================================
CREATE TABLE ingestion_jobs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type                 TEXT NOT NULL
                                 CHECK (source_type IN ('zip', 'pdf', 'csv', 'xlsx', 'gdrive')),
    source_reference            TEXT NOT NULL,
    -- Storage key for the staged upload (R2 or local-disk StorageProvider), NULL for gdrive
    -- jobs which stream directly from Drive instead of being staged first.
    storage_key                 TEXT,
    status                      TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    total_files_discovered      INTEGER NOT NULL DEFAULT 0,
    files_processed             INTEGER NOT NULL DEFAULT 0,
    total_rows_found            INTEGER NOT NULL DEFAULT 0,
    total_leads_created         INTEGER NOT NULL DEFAULT 0,
    total_leads_merged          INTEGER NOT NULL DEFAULT 0,
    total_rows_flagged_for_review INTEGER NOT NULL DEFAULT 0,
    total_errors                INTEGER NOT NULL DEFAULT 0,
    -- Array of { file, message } — file/row-level parse failures that stopped that file, not the job.
    error_details                JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Array of { sourceFile, reason, detail, snippet? } — extracted content with no confident
    -- email, so no leads row could be created; needs a human to act on it.
    review_items                  JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at                    TIMESTAMPTZ,
    completed_at                  TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs (status);
CREATE INDEX idx_ingestion_jobs_created_at ON ingestion_jobs (created_at DESC);
CREATE TRIGGER trg_ingestion_jobs_updated_at BEFORE UPDATE ON ingestion_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- leads
-- ============================================================================
CREATE TABLE leads (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email                       TEXT NOT NULL,
    email_normalized            TEXT NOT NULL,

    company_name                TEXT,
    contact_name                TEXT,
    phone                       TEXT,
    website                     TEXT,
    industry                    TEXT,
    country                     TEXT,
    region                      TEXT,

    ingestion_job_id            UUID REFERENCES ingestion_jobs (id) ON DELETE SET NULL,
    source_file                 TEXT,

    category_id                 UUID REFERENCES categories (id) ON DELETE SET NULL,
    categorization_method       TEXT
                                 CHECK (categorization_method IN ('rule_based', 'ai', 'manual')),
    categorization_confidence   NUMERIC(4, 3),

    raw_data                    JSONB NOT NULL DEFAULT '{}'::jsonb,

    status                      TEXT NOT NULL DEFAULT 'new'
                                 CHECK (status IN (
                                     'new',
                                     'needs_review',
                                     'categorized',
                                     'deck_generated',
                                     'in_sequence',
                                     'completed',
                                     'replied',
                                     'bounced',
                                     'do_not_contact'
                                 )),
    -- Populated when status = 'needs_review'. See shared LeadReviewReason for the known set.
    review_reason                TEXT,
    -- 0-1 confidence of the extraction that produced/updated this row (PDF heuristic/AI paths).
    -- NULL for confidently-structured CSV/XLSX rows.
    extraction_confidence         NUMERIC(4, 3),

    deleted_at                    TIMESTAMPTZ,

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (email_normalized)
);
CREATE INDEX idx_leads_status ON leads (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_category_id ON leads (category_id);
CREATE INDEX idx_leads_ingestion_job_id ON leads (ingestion_job_id);
CREATE INDEX idx_leads_raw_data_gin ON leads USING GIN (raw_data);
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- pitch_decks
-- ============================================================================
CREATE TABLE pitch_decks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    category_id         UUID REFERENCES categories (id) ON DELETE SET NULL,
    generation_status   TEXT NOT NULL DEFAULT 'pending'
                         CHECK (generation_status IN ('pending', 'generating', 'ready', 'failed')),
    generation_error    TEXT,
    generated_by        TEXT,
    template_version    TEXT,
    file_key            TEXT,
    file_url            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pitch_decks_lead_id ON pitch_decks (lead_id);
CREATE INDEX idx_pitch_decks_status ON pitch_decks (generation_status);
CREATE TRIGGER trg_pitch_decks_updated_at BEFORE UPDATE ON pitch_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- email_sequences
-- ============================================================================
CREATE TABLE email_sequences (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                         UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    pitch_deck_id                   UUID REFERENCES pitch_decks (id) ON DELETE SET NULL,
    current_stage                   TEXT NOT NULL DEFAULT 'new'
                                     CHECK (current_stage IN (
                                         'new', 'followup', 'final',
                                         'completed', 'stopped_reply', 'stopped_bounce', 'stopped_manual'
                                     )),
    stage_new_sent_at               TIMESTAMPTZ,
    stage_followup_scheduled_at     TIMESTAMPTZ,
    stage_followup_sent_at          TIMESTAMPTZ,
    stage_final_scheduled_at        TIMESTAMPTZ,
    stage_final_sent_at             TIMESTAMPTZ,
    stopped_reason                  TEXT,
    stopped_at                      TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id)
);
CREATE INDEX idx_email_sequences_followup_due
    ON email_sequences (stage_followup_scheduled_at)
    WHERE current_stage = 'new' AND stage_followup_sent_at IS NULL;
CREATE INDEX idx_email_sequences_final_due
    ON email_sequences (stage_final_scheduled_at)
    WHERE current_stage = 'followup' AND stage_final_sent_at IS NULL;
CREATE INDEX idx_email_sequences_current_stage ON email_sequences (current_stage);
CREATE TRIGGER trg_email_sequences_updated_at BEFORE UPDATE ON email_sequences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- mailbox_accounts
-- ============================================================================
CREATE TABLE mailbox_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name       TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    email_address       TEXT NOT NULL,
    display_name        TEXT,
    daily_send_limit    INTEGER NOT NULL DEFAULT 300,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    credentials_ref     TEXT,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (email_address)
);
CREATE TRIGGER trg_mailbox_accounts_updated_at BEFORE UPDATE ON mailbox_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- sent_emails_log
-- ============================================================================
CREATE TABLE sent_emails_log (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id               UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    email_sequence_id     UUID NOT NULL REFERENCES email_sequences (id) ON DELETE CASCADE,
    mailbox_account_id    UUID REFERENCES mailbox_accounts (id) ON DELETE SET NULL,
    sequence_stage        TEXT NOT NULL CHECK (sequence_stage IN ('new', 'followup', 'final')),
    provider_name         TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    external_message_id   TEXT,
    subject                TEXT NOT NULL,
    body_snapshot          TEXT,
    pitch_deck_id           UUID REFERENCES pitch_decks (id) ON DELETE SET NULL,
    status                  TEXT NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'opened')),
    error_message            TEXT,
    retry_count               INTEGER NOT NULL DEFAULT 0,
    sent_at                   TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sent_emails_log_lead_id ON sent_emails_log (lead_id);
CREATE INDEX idx_sent_emails_log_sequence_id ON sent_emails_log (email_sequence_id);
CREATE INDEX idx_sent_emails_log_status ON sent_emails_log (status);
CREATE INDEX idx_sent_emails_log_sent_at ON sent_emails_log (sent_at);
CREATE INDEX idx_sent_emails_log_external_message_id ON sent_emails_log (external_message_id);
CREATE TRIGGER trg_sent_emails_log_updated_at BEFORE UPDATE ON sent_emails_log
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- replies
-- ============================================================================
CREATE TABLE replies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id               UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    email_sequence_id     UUID REFERENCES email_sequences (id) ON DELETE SET NULL,
    sent_email_log_id     UUID REFERENCES sent_emails_log (id) ON DELETE SET NULL,
    provider_name         TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    external_message_id   TEXT,
    from_email             TEXT NOT NULL,
    subject                 TEXT,
    body_snapshot            TEXT,
    raw_payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at                TIMESTAMPTZ NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replies_lead_id ON replies (lead_id);
CREATE INDEX idx_replies_sequence_id ON replies (email_sequence_id);
CREATE INDEX idx_replies_raw_payload_gin ON replies USING GIN (raw_payload);

-- ============================================================================
-- email_provider_config
-- ============================================================================
CREATE TABLE email_provider_config (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name               TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    is_active                   BOOLEAN NOT NULL DEFAULT false,
    config                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_health_check_at        TIMESTAMPTZ,
    last_health_check_status    TEXT CHECK (last_health_check_status IN ('ok', 'error')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_name)
);
CREATE TRIGGER trg_email_provider_config_updated_at BEFORE UPDATE ON email_provider_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
