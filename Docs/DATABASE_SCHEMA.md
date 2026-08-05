# Database Schema

PostgreSQL schema for the BeBeyond Digital Solutions AI Email Outreach Automation Agent.

This document is the source of truth for schema design. It is written as annotated SQL DDL
rather than ORM models — the ORM (Prisma vs. Drizzle) is an implementation choice deferred to
Phase 1, and hand-written SQL keeps this document provider- and tool-agnostic in the meantime.

## Design principles

1. **Permanent dedup by email.** `leads.email_normalized` carries a `UNIQUE` constraint. Leads
   are never hard-deleted (see `deleted_at` below), so the uniqueness guarantee holds for the
   lifetime of the system, not just the lifetime of a given row. Re-ingesting a file that
   contains an already-known address must be a no-op (`ON CONFLICT DO NOTHING`/`UPDATE`), never
   a new row.
2. **Provider-agnostic by construction.** No table stores a Brevo- or Gmail-specific column.
   Provider identity is always carried generically via `provider_name TEXT` +
   `external_message_id TEXT`. Switching `EMAIL_PROVIDER` in `.env` never requires a migration.
3. **Status via `TEXT` + `CHECK`, not native `ENUM`.** Postgres native enums require
   `ALTER TYPE ... ADD VALUE` (and in older Postgres, outside a transaction) to extend, which is
   awkward mid-project while sequence stages / statuses are still being tightened. `TEXT` with a
   `CHECK` constraint gives the same guarantee and is a one-line migration to extend.
4. **Every table gets audit fields.** `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and
   `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, the latter maintained by a shared trigger
   (`set_updated_at()`), defined once and attached per table.
5. **Categorization stays flexible.** Categorization criteria are not finalized. `categories`
   stores matching rules in a `criteria JSONB` column so rule changes are data changes, not
   schema changes. The four known top-level service groups (Digital Marketing, Web & App
   Solutions, Creative Services, Marketplace & Commerce) are seed data, not hardcoded columns.
6. **Traceability over convenience.** Raw ingested rows and raw provider payloads are kept
   (`leads.raw_data`, `replies.raw_payload`) so mis-parses or mis-categorizations can be
   debugged after the fact without re-fetching the source file.

## Entity overview

```
ingestion_jobs 1───* leads *───1 categories
                       │
                       ├──1 pitch_decks (per lead, latest)
                       │
                       └──1 email_sequences ──*──> sent_emails_log ──0..1──> replies
                                                          │
                                                          └── mailbox_accounts (which mailbox sent it)

email_provider_config  (standalone: one row per known provider, tracks active/inactive + non-secret config)
daily_summary          (standalone: one row per scheduler run_date, audit log — see § 6 Daily Scheduler)
```

---

## `categories`

The 4 known service categories, seeded by Phase 2
(`Backend/src/db/migrations/0002_categorization.sql`): Digital Marketing, Web & App Solutions,
Creative Services, Marketplace & Commerce.

> **Phase 2 note:** the actual rule-matching logic lives in the dedicated `categorization_rules`
> table below, not in `criteria` — a separate table turned out more structured/queryable for a
> rule engine (filter by category, toggle `is_active`, inspect weights) than one JSONB blob per
> category. `criteria` is left in place for possible future free-form per-category config, but
> Phase 2 doesn't read it.

```sql
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
    -- Reserved for future free-form per-category config; not read by the Phase 2 rule engine.
    criteria            JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (slug)
);

CREATE INDEX idx_categories_service_group ON categories (service_group);
CREATE INDEX idx_categories_criteria_gin ON categories USING GIN (criteria);
```

---

## `categorization_rules`

DB-stored, editable-without-deploy rules the rule engine (`ruleEngine.ts`) is a pure function
over — there is no hardcoded if/else category logic anywhere in application code. Seeded with an
agent-proposed, user-confirmed starter set; tune weights/patterns directly via SQL as real lead
data comes in.

```sql
CREATE TABLE categorization_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    match_field   TEXT NOT NULL CHECK (match_field IN ('industry', 'company_name', 'website', 'raw_data', 'any')),
    match_type    TEXT NOT NULL DEFAULT 'keyword' CHECK (match_type IN ('keyword', 'regex')),
    pattern       TEXT NOT NULL,
    -- Contribution to the category's score when matched; summed per category, capped at 1.0.
    -- An 'industry'-field hit is weighted higher (0.6, crosses the primary threshold alone)
    -- than an 'any'-field hit (0.35, a broader/weaker signal — needs two to cross primary).
    weight        NUMERIC(4, 3) NOT NULL DEFAULT 0.350,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categorization_rules_category_id ON categorization_rules (category_id);
CREATE INDEX idx_categorization_rules_active ON categorization_rules (is_active);
```

Thresholds (in `ruleEngine.ts`, not the DB — these tune how scores are interpreted, not what
scores rules produce): a category scoring **≥ 0.5** is a confident primary match (rules alone
decide it, no AI call); **≥ 0.3** but below that is a secondary candidate; below 0.3 is ignored.
Up to 2 secondary categories are kept, ranked by confidence.

---

## `lead_secondary_categories`

A lead can match more than one category. `leads.category_id` remains the single PRIMARY category
(used for deck/email personalization); this table holds up to 2 additional plausible categories,
each tagged with how it was found.

```sql
CREATE TABLE lead_secondary_categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id       UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    category_id   UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    confidence    NUMERIC(4, 3) NOT NULL,
    method        TEXT NOT NULL CHECK (method IN ('rule_based', 'ai')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id, category_id)
);

CREATE INDEX idx_lead_secondary_categories_lead_id ON lead_secondary_categories (lead_id);
```

> Recomputed wholesale on every categorization run (`leadCategoriesRepository.replaceSecondaryCategories`
> deletes and re-inserts inside one transaction) — categorization always produces a complete
> picture, never an incremental one, so there's nothing to diff.

---

## `ingestion_jobs`

One row per ingestion run (a single uploaded ZIP/PDF/CSV/XLSX, or a Google Drive link that may
expand into many nested files). Tracks progress and gives ingestion a status the dashboard can
surface without tailing logs.

> **Phase 1 amendment:** `total_duplicates_skipped` (Phase 0 draft) is replaced by
> `total_leads_merged` — Phase 1 actively merges blank fields into existing leads rather than
> just skipping duplicates, so the counter name now reflects what actually happens. Added
> `files_processed` (for "245/600 files processed"-style progress),
> `total_rows_flagged_for_review`, and `review_items` (content that couldn't become a lead row
> at all — no confident email — as opposed to `error_details`, which is parse/file failures).

```sql
CREATE TABLE ingestion_jobs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type                 TEXT NOT NULL
                                 CHECK (source_type IN ('zip', 'pdf', 'csv', 'xlsx', 'gdrive')),
    -- Original filename, or the Google Drive URL/folder ID
    source_reference            TEXT NOT NULL,
    -- Staged-upload storage key (R2 or local-disk StorageProvider); NULL for gdrive jobs, which
    -- stream directly from Drive instead of being staged first.
    storage_key                 TEXT,
    status                      TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    total_files_discovered      INTEGER NOT NULL DEFAULT 0,   -- incl. nested files inside zips/gdrive folders
    files_processed             INTEGER NOT NULL DEFAULT 0,   -- attempted + finished, success or not — "245/600"
    total_rows_found            INTEGER NOT NULL DEFAULT 0,
    total_leads_created         INTEGER NOT NULL DEFAULT 0,
    total_leads_merged          INTEGER NOT NULL DEFAULT 0,
    total_rows_flagged_for_review INTEGER NOT NULL DEFAULT 0, -- leads created with status = 'needs_review'
    total_errors                INTEGER NOT NULL DEFAULT 0,
    -- Array of { file, message } objects for file/row parse failures, so one bad file
    -- doesn't fail the whole job silently or noisily dump into server logs only.
    error_details                JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Array of { sourceFile, reason, detail, snippet? } — content with no confident email, so
    -- no leads row could even be created; needs a human to act on it manually.
    review_items                  JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at                    TIMESTAMPTZ,
    completed_at                  TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs (status);
CREATE INDEX idx_ingestion_jobs_created_at ON ingestion_jobs (created_at DESC);
```

---

## `leads`

The central entity. `email_normalized` is the permanent dedup key.

> **Phase 1 amendment:** added `'needs_review'` to `status`, plus `review_reason` and
> `extraction_confidence`. A row lands here when ingestion's extraction confidence is too low to
> trust (AI-parsed/heuristic PDF data) — it is never auto-promoted into the active pipeline. See
> `Docs/ARCHITECTURE.md` § 1 Ingestion Layer.

```sql
CREATE TABLE leads (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email                   TEXT NOT NULL,               -- as originally seen (preserve casing for display)
    email_normalized        TEXT NOT NULL,                -- lower(trim(email)); dedup key

    company_name            TEXT,
    contact_name             TEXT,
    phone                   TEXT,
    website                 TEXT,
    industry                TEXT,
    country                 TEXT,
    region                  TEXT,

    ingestion_job_id        UUID REFERENCES ingestion_jobs (id) ON DELETE SET NULL,
    source_file             TEXT,                        -- specific file within the job (zip/gdrive can nest many)

    -- PRIMARY category only — see lead_secondary_categories for additional matches.
    category_id             UUID REFERENCES categories (id) ON DELETE SET NULL,
    categorization_method   TEXT
                             CHECK (categorization_method IN ('rule_based', 'ai', 'manual')),
    -- 0.000–1.000. Meaningful for both methods as of Phase 2 (see categorization_rules).
    categorization_confidence NUMERIC(4, 3),

    -- Original ingested row, untouched, for debugging bad parses/categorizations later.
    raw_data                JSONB NOT NULL DEFAULT '{}'::jsonb,

    status                  TEXT NOT NULL DEFAULT 'new'
                             CHECK (status IN (
                                 'new',              -- ingested, not yet categorized
                                 'needs_review',       -- low-confidence extraction — never auto-promoted
                                 'categorized',       -- category assigned, deck not yet generated
                                 'deck_generated',    -- ready to enter the email sequence
                                 'in_sequence',       -- at least one email sent, sequence active
                                 'completed',         -- sequence finished (all 3 stages sent, no reply)
                                 'replied',            -- lead replied; sequence stopped
                                 'bounced',            -- hard bounce; sequence stopped
                                 'do_not_contact'      -- manually suppressed
                             )),
    -- Populated when status = 'needs_review', e.g. 'pdf_heuristic_table_extraction',
    -- 'pdf_ai_extraction_pending', 'pdf_scanned_needs_ocr', 'ambiguous_column_mapping'.
    review_reason             TEXT,
    -- 0.000–1.000 confidence of the extraction that produced/last merged this row. NULL for
    -- confidently-structured CSV/XLSX rows.
    extraction_confidence      NUMERIC(4, 3),

    -- Soft delete only. A hard DELETE would let the same address be re-ingested and
    -- re-emailed later, breaking the permanent-dedup guarantee.
    deleted_at               TIMESTAMPTZ,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (email_normalized)
);

CREATE INDEX idx_leads_status ON leads (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_category_id ON leads (category_id);
CREATE INDEX idx_leads_ingestion_job_id ON leads (ingestion_job_id);
CREATE INDEX idx_leads_raw_data_gin ON leads USING GIN (raw_data);
```

> **Dedup enforcement note:** the application layer normalizes (`lower(trim(email))`) before
> insert/lookup. Ingestion (`leadsRepository.upsertLead`, see `Backend/src/db/repositories/`)
> does `INSERT ... ON CONFLICT (email_normalized) DO NOTHING RETURNING ...`; on conflict, it
> locks the existing row (`SELECT ... FOR UPDATE`) and applies only blank-field fill-ins
> (never overwriting existing non-blank data — see `Backend/src/modules/ingestion/normalize.ts`),
> counted in `ingestion_jobs.total_leads_merged`. A duplicate never produces a second row.

---

## `pitch_decks`

Generated, personalized decks per lead. Kept separate from `leads` because generation is async,
can fail/retry, and a lead may eventually get more than one deck version.

> **Phase 3 note:** `generated_by` ended up `'react-pdf-template'` (previously
> `'pptxgenjs-template'` — see below) rather than an AI provider name — deck generation turned
> out to need no AI call at all (see `Docs/ARCHITECTURE.md` § 3). The column stays generic
> (`TEXT`, not a `CHECK`-constrained enum) so switching values didn't need a migration.
> `file_key`/`file_url` work the same regardless of storage backend — R2 in production, local
> disk in dev (see `Backend/src/storage/`); `file_url` falls back to this backend's own
> `GET /api/decks/:id/download` route when no R2 public URL is configured.
>
> **`pdf_file_key`/`pdf_file_url` note (migration `0005_deck_pdf.sql`):** added when generation
> was a two-step pptxgenjs-build + LibreOffice-convert pipeline, to store the `.pptx` under
> `file_key`/`file_url` and the converted `.pdf` under these columns separately. Deck generation
> has since been re-platformed onto `@react-pdf/renderer` (see `Docs/ARCHITECTURE.md` § 3),
> which renders a PDF directly — there is only one artifact now, so `generateDeckForLead()`
> writes the same generated bytes/URL into **both** column pairs rather than two different
> files. The columns themselves were left as-is (no migration to merge them) since every
> existing reader — `sendingService.ts`'s attachment logic reads `pdfFileKey` specifically,
> the dashboard's default download reads `fileKey` — keeps working unchanged either way.

```sql
CREATE TABLE pitch_decks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    category_id         UUID REFERENCES categories (id) ON DELETE SET NULL,

    generation_status   TEXT NOT NULL DEFAULT 'pending'
                         CHECK (generation_status IN ('pending', 'generating', 'ready', 'failed')),
    generation_error    TEXT,
    generated_by        TEXT,                -- 'react-pdf-template' as of the re-platform (see note above)
    template_version    TEXT,                -- version tag of the base BeBeyond deck template used

    -- Cloudflare R2 (S3-compatible) storage pointers, or local-disk equivalents in dev.
    -- Both pairs now point at the SAME generated .pdf (see pdf_file_key note above) rather than
    -- two different files.
    file_key            TEXT,                -- object key within the bucket
    file_url            TEXT,                -- resolved public/signed URL, if applicable
    pdf_file_key         TEXT,               -- added in migration 0005_deck_pdf.sql
    pdf_file_url          TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pitch_decks_lead_id ON pitch_decks (lead_id);
CREATE INDEX idx_pitch_decks_status ON pitch_decks (generation_status);
```

---

## `email_sequences`

One row per lead — the sequence is a fixed 3-stage state machine
(`new` → `followup` [day 3] → `final` [day 7 from original send]), stopping immediately on
reply. `UNIQUE (lead_id)` because a lead is only ever run through the sequence once, ever (ties
back to the permanent-dedup requirement — even after `completed`, a lead is never re-entered).

```sql
CREATE TABLE email_sequences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    pitch_deck_id           UUID REFERENCES pitch_decks (id) ON DELETE SET NULL,

    current_stage           TEXT NOT NULL DEFAULT 'new'
                             CHECK (current_stage IN (
                                 'new', 'followup', 'final', 'completed',
                                 'stopped_reply', 'stopped_bounce', 'stopped_unsubscribe', 'stopped_manual'
                             )),

    stage_new_sent_at        TIMESTAMPTZ,
    stage_followup_scheduled_at TIMESTAMPTZ,   -- original_send + 3 days
    stage_followup_sent_at   TIMESTAMPTZ,
    stage_final_scheduled_at TIMESTAMPTZ,      -- original_send + 7 days
    stage_final_sent_at      TIMESTAMPTZ,

    stopped_reason           TEXT,             -- free text detail alongside current_stage's stopped_* value
    stopped_at                TIMESTAMPTZ,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (lead_id)
);

-- The scheduler's core query is "what's due right now": index the two scheduled-at columns.
--
-- Phase 5 amendment: these predicates were WRONG from Phase 0 through Phase 4 (never actually
-- queried until the Daily Scheduler, migrations/0004_scheduler.sql, fixed them). markStageSent()
-- advances current_stage to 'followup'/'final' the instant the PRECEDING stage is sent — so a
-- sequence actually due for a followup send has current_stage = 'followup' (not 'new'), and one
-- due for final has current_stage = 'final' (not 'followup'). Shown below as fixed.
CREATE INDEX idx_email_sequences_followup_due
    ON email_sequences (stage_followup_scheduled_at)
    WHERE current_stage = 'followup' AND stage_followup_sent_at IS NULL;
CREATE INDEX idx_email_sequences_final_due
    ON email_sequences (stage_final_scheduled_at)
    WHERE current_stage = 'final' AND stage_final_sent_at IS NULL;
CREATE INDEX idx_email_sequences_current_stage ON email_sequences (current_stage);
```

`stopSequenceForLead()` (Phase 5, `db/repositories/emailSequencesRepository.ts`) is the only
writer of the `stopped_*` values — idempotent by construction: it only updates a row whose
`current_stage` isn't already one of `completed`/`stopped_reply`/`stopped_bounce`/
`stopped_unsubscribe`/`stopped_manual`, so a duplicate webhook delivery can never downgrade or
overwrite an earlier terminal reason.

---

## `mailbox_accounts`

Not used for single-mailbox operation today, but the sending engine should look up "which
mailbox do I send from" through this table from day one so multi-mailbox rotation (e.g. several
Workspace sending addresses to spread volume/reputation) is a data change later, not a schema
or code change.

```sql
CREATE TABLE mailbox_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name       TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    email_address        TEXT NOT NULL,
    display_name         TEXT,
    daily_send_limit     INTEGER NOT NULL DEFAULT 300,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    -- Pointer to where credentials actually live (env var name / secret manager key).
    -- Never store raw API keys, OAuth tokens, or passwords in the database.
    credentials_ref       TEXT,
    last_used_at          TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (email_address)
);
```

---

## `sent_emails_log`

The table the "never silently fail" requirement leans on hardest — `status` + `error_message`
must always reflect reality, and `retry_count` tracks BullMQ retry attempts for that specific
send.

> **Phase 4 amendment:** Phase 0 described this table as append-only; it no longer is. One row
> now tracks a `(lead_id, sequence_stage)` send's full lifecycle across retries — the same
> pattern already used by `ingestion_jobs` and `pitch_decks` — because `UNIQUE (lead_id,
sequence_stage)` (added below) is the DB-level primitive the whole sending engine's race
> safety depends on: `INSERT ... ON CONFLICT (lead_id, sequence_stage) DO NOTHING RETURNING id`
> lets Postgres itself guarantee exactly one concurrent attempt ever wins, rather than an
> application-level check that a race could slip through. See
> `Backend/src/db/repositories/sentEmailsLogRepository.ts#claimSendAttempt` and
> `Docs/ARCHITECTURE.md` § 5. Also added `category_id` — a point-in-time snapshot of the lead's
> category at send time (a lead can be recategorized later; the log should reflect what applied
> when the email actually went out).

> **Phase 5 amendment:** added `'cancelled'` to the `status` CHECK — a send that was claimed and
> composed but aborted by the mid-flight eligibility re-check (reply/bounce/unsubscribe landed
> during composition, see `Docs/ARCHITECTURE.md` § 5) before the provider was ever called.
> Distinct from `'failed'` (provider rejected or errored) — a cancelled send was never attempted.
> `pitch_deck_id` (already present since Phase 0 but unused until now) is now populated for
> `'new'`-stage sends — a snapshot of which deck version was actually attached, same rationale as
> `category_id`.

```sql
CREATE TABLE sent_emails_log (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id              UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    email_sequence_id    UUID NOT NULL REFERENCES email_sequences (id) ON DELETE CASCADE,
    mailbox_account_id   UUID REFERENCES mailbox_accounts (id) ON DELETE SET NULL,
    category_id          UUID REFERENCES categories (id) ON DELETE SET NULL,

    sequence_stage        TEXT NOT NULL CHECK (sequence_stage IN ('new', 'followup', 'final')),

    -- Provider-agnostic identity of the send
    provider_name          TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    external_message_id    TEXT,             -- provider's message ID, once known; used to correlate replies/bounces

    subject                 TEXT NOT NULL,
    body_snapshot           TEXT,             -- rendered body at send time, for audit (or an R2 pointer if large)
    pitch_deck_id            UUID REFERENCES pitch_decks (id) ON DELETE SET NULL,

    status                   TEXT NOT NULL DEFAULT 'queued'
                              CHECK (status IN (
                                  'queued', 'sending', 'sent', 'delivered',
                                  'failed', 'bounced', 'opened', 'cancelled'
                              )),
    error_message             TEXT,
    retry_count                INTEGER NOT NULL DEFAULT 0,

    sent_at                    TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The race-safety primitive claimSendAttempt() depends on — see amendment note above.
    UNIQUE (lead_id, sequence_stage)
);

CREATE INDEX idx_sent_emails_log_lead_id ON sent_emails_log (lead_id);
CREATE INDEX idx_sent_emails_log_sequence_id ON sent_emails_log (email_sequence_id);
CREATE INDEX idx_sent_emails_log_status ON sent_emails_log (status);
CREATE INDEX idx_sent_emails_log_sent_at ON sent_emails_log (sent_at);
CREATE INDEX idx_sent_emails_log_external_message_id ON sent_emails_log (external_message_id);
CREATE INDEX idx_sent_emails_log_category_id ON sent_emails_log (category_id);
```

---

## `replies`

Normalized replies regardless of source (Brevo Inbound Parse webhook or Gmail
watch/Pub-Sub push). A reply's arrival is what flips `email_sequences.current_stage` to
`stopped_reply` and `leads.status` to `replied`.

```sql
CREATE TABLE replies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id               UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    email_sequence_id     UUID REFERENCES email_sequences (id) ON DELETE SET NULL,
    -- Which sent email this is a reply to, when determinable (e.g. via In-Reply-To header)
    sent_email_log_id     UUID REFERENCES sent_emails_log (id) ON DELETE SET NULL,

    provider_name          TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    external_message_id    TEXT,

    from_email              TEXT NOT NULL,
    subject                  TEXT,
    body_snapshot             TEXT,
    -- Full raw webhook/Pub-Sub payload, kept for debugging parsing issues after the fact.
    raw_payload                JSONB NOT NULL DEFAULT '{}'::jsonb,

    received_at                TIMESTAMPTZ NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replies_lead_id ON replies (lead_id);
CREATE INDEX idx_replies_sequence_id ON replies (email_sequence_id);
CREATE INDEX idx_replies_raw_payload_gin ON replies USING GIN (raw_payload);
```

---

## `email_provider_config`

Small config/status table, one row per known provider. `EMAIL_PROVIDER` in `.env` is what
actually decides which implementation runs; this table exists so the dashboard can show
provider status/health without reading `.env`, and so non-secret settings (sender display name,
per-provider quota override) live in data rather than code. **Secrets stay in env vars / a
secret manager — never in this table.**

```sql
CREATE TABLE email_provider_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name    TEXT NOT NULL CHECK (provider_name IN ('brevo', 'gmail')),
    is_active         BOOLEAN NOT NULL DEFAULT false,   -- mirrors EMAIL_PROVIDER; used for dashboard display/audit only
    -- Non-secret settings only, e.g. { "sender_display_name": "BeBeyond Digital Solutions", "daily_quota_override": null }
    config             JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_health_check_at TIMESTAMPTZ,
    last_health_check_status TEXT CHECK (last_health_check_status IN ('ok', 'error')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_name)
);
```

---

## Shared `updated_at` trigger

Attached to every table above that has `updated_at`.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Repeat per table, e.g.:
CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## `daily_summary` — implemented (Phase 5)

One row per scheduler `run_date`, for audit — see `Docs/ARCHITECTURE.md` § 6 for the full
read/write model (queued counts are a per-run snapshot, upserted; sent/failed/cancelled counts
accumulate live as sends actually resolve, whether scheduler- or manually-triggered).

```sql
CREATE TABLE daily_summary (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date              DATE NOT NULL UNIQUE,

    new_queued            INTEGER NOT NULL DEFAULT 0,
    followup_queued       INTEGER NOT NULL DEFAULT 0,
    final_queued          INTEGER NOT NULL DEFAULT 0,

    new_sent              INTEGER NOT NULL DEFAULT 0,
    followup_sent         INTEGER NOT NULL DEFAULT 0,
    final_sent            INTEGER NOT NULL DEFAULT 0,
    failed_count          INTEGER NOT NULL DEFAULT 0,
    cancelled_count       INTEGER NOT NULL DEFAULT 0,

    skipped_reply         INTEGER NOT NULL DEFAULT 0,
    skipped_bounce        INTEGER NOT NULL DEFAULT 0,
    skipped_optout        INTEGER NOT NULL DEFAULT 0,

    daily_cap             INTEGER NOT NULL DEFAULT 300,
    priority_exceeded_cap BOOLEAN NOT NULL DEFAULT false,
    scheduler_errors      JSONB NOT NULL DEFAULT '[]'::jsonb,

    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`UNIQUE (run_date)` plus upsert-on-conflict (`recordSchedulerRun`, `incrementSentCount`, etc. —
see `db/repositories/dailySummaryRepository.ts`) is what makes a crashed-and-rerun scheduler safe
to log against: a re-run the same day overwrites its own queued-count snapshot rather than
creating a second row or double-summing.

---

## Daily send quota (300/day, priority-split)

No dedicated table for the quota decision itself — it's a derived query each run, not stored
state (the _outcome_ of each run is what `daily_summary` above records). The scheduler
(`modules/scheduler/dailySchedulerService.ts`, see `Docs/ARCHITECTURE.md` § 6) computes, per run:

1. `due_followups` = rows from `email_sequences` where `current_stage = 'followup'`,
   `stage_followup_sent_at IS NULL`, and `stage_followup_scheduled_at <= now()` (uses
   `idx_email_sequences_followup_due`).
2. `due_finals` = same shape against the `final` stage (`current_stage = 'final'`,
   `idx_email_sequences_final_due`).
3. `already_claimed_today` = `COUNT(*) FROM sent_emails_log WHERE created_at` falls within
   today's `[dayStart, dayEnd)` in `SCHEDULER_TIMEZONE`.
4. `remaining_quota` = `max(0, DAILY_EMAIL_LIMIT − already_claimed_today − (due_followups +
due_finals))`.
5. Send all of `due_followups` + `due_finals` first (deadline-bound, must not slip a day) —
   **always**, even if that alone exceeds `DAILY_EMAIL_LIMIT`. When it does,
   `daily_summary.priority_exceeded_cap` is set `true` and a warning is logged; `remaining_quota`
   is `0`, so zero NEW emails go out that day rather than silently dropping a deadline-bound one.
6. Fill whatever quota remains with new leads in `status = 'deck_generated'`, oldest first.

## Open items

- Categorization rule tuning — Phase 2 seeded a starter `categorization_rules` set
  (agent-proposed, user-confirmed) covering common industry keywords per category; expected to
  be refined against real lead data (add/adjust patterns and weights directly via SQL).
- ORM selection (Prisma vs. Drizzle) — Phase 1 shipped a small hand-written migration runner
  (`Backend/src/db/migrate.ts` + `Backend/src/db/migrations/*.sql`) instead; still open whether
  an ORM gets layered on top later.
- Whether `body_snapshot` columns should move to R2 pointers if email bodies turn out to be
  large enough to bloat the row (unlikely at plain-text/HTML-template scale, but noted).
