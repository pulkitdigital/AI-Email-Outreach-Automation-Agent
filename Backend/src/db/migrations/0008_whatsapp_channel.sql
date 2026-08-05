-- WhatsApp channel infrastructure (Meta WhatsApp Cloud API) — see
-- shared/src/types/whatsapp.ts and Backend/src/providers/whatsapp/. Channel infrastructure
-- only: NOT wired into the Daily Scheduler yet (sending stays manually triggered from the
-- dashboard until Meta Business verification is confirmed live).
--
-- COMPLIANCE: Meta's WhatsApp Business Policy prohibits cold outbound messaging without
-- explicit opt-in. leads.whatsapp_opted_in is a hard invariant — see
-- Backend/src/db/repositories/whatsappRepository.ts, which re-checks this column directly
-- before every send rather than trusting a passed-in lead object.

ALTER TABLE leads ADD COLUMN whatsapp_number TEXT;
ALTER TABLE leads ADD COLUMN whatsapp_opted_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN whatsapp_opt_in_source TEXT
    CHECK (whatsapp_opt_in_source IN ('click_to_whatsapp', 'reply_offer', 'manual'));
ALTER TABLE leads ADD COLUMN whatsapp_opt_in_at TIMESTAMPTZ;
-- Tracks the 24h freeform-message session window (Meta's rule: freeform text is only sendable
-- within 24h of the lead's most recent inbound message; outside that window only pre-approved
-- template messages are allowed). Updated on every inbound message, never on outbound.
ALTER TABLE leads ADD COLUMN whatsapp_last_inbound_at TIMESTAMPTZ;

-- ============================================================================
-- whatsapp_messages_log
-- ============================================================================
CREATE TABLE whatsapp_messages_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL when an inbound message's phone number couldn't be matched to any known lead — logged
    -- anyway (see routes/webhooks.ts's whatsapp handler) so it surfaces in the dashboard for
    -- manual review/matching rather than being silently dropped.
    lead_id                 UUID REFERENCES leads (id) ON DELETE SET NULL,
    direction               TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type            TEXT NOT NULL CHECK (message_type IN ('template', 'freeform')),
    template_name           TEXT,
    from_phone_number       TEXT,
    body_preview            TEXT,
    meta_message_id         TEXT,
    conversation_category   TEXT CHECK (conversation_category IN ('marketing', 'utility', 'service')),
    status                  TEXT NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
    error_message            TEXT,
    raw_payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_messages_log_lead_id ON whatsapp_messages_log (lead_id);
CREATE INDEX idx_whatsapp_messages_log_unmatched ON whatsapp_messages_log (created_at DESC) WHERE lead_id IS NULL;
CREATE INDEX idx_whatsapp_messages_log_meta_message_id ON whatsapp_messages_log (meta_message_id);
CREATE INDEX idx_whatsapp_messages_log_created_at ON whatsapp_messages_log (created_at DESC);

-- ============================================================================
-- whatsapp_templates
-- ============================================================================
-- Mirrors template state from Meta Business Manager for reference in the app — approval itself
-- happens manually on Meta's side; nothing here calls Meta's template-management API.
CREATE TABLE whatsapp_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    meta_template_id    TEXT,
    language            TEXT NOT NULL DEFAULT 'en',
    category            TEXT CHECK (category IN ('marketing', 'utility', 'service')),
    approval_status     TEXT NOT NULL DEFAULT 'pending'
                         CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    -- Placeholder definitions, e.g. [{ "name": "company_name", "example": "Acme Co" }] — informs
    -- the dashboard's template-send form which variables to collect.
    variables           JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, language)
);
CREATE INDEX idx_whatsapp_templates_approval_status ON whatsapp_templates (approval_status);
