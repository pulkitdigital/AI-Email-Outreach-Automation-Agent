# Architecture

System architecture for the BeBeyond Digital Solutions AI Email Outreach Automation Agent.
The backend pipeline is organized as six layers, each with a narrow responsibility and a clear
handoff to the next. Layers communicate through the database (see `Docs/DATABASE_SCHEMA.md`) and
BullMQ queues — never by calling each other's internals directly — so any layer can be retried,
re-run, or reimplemented without touching its neighbors. A seventh layer, the Dashboard (§ 7),
sits on top as a pure consumer of the backend's HTTP API — it reads and triggers actions on the
same six layers, but owns no pipeline logic of its own.

```
 ┌─────────────┐   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐   ┌───────────────┐   ┌───────────────┐
 │  Ingestion  │──▶│ Categorization │──▶│ Deck Generation│──▶│ Email Composer │──▶│ Sending Engine│──▶│ Daily Scheduler│
 └─────────────┘   └────────────────┘   └────────────────┘   └────────────────┘   └───────────────┘   └───────────────┘
       │                    │                    │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼                    ▼                    ▼
   leads,            leads.category_id,      pitch_decks          (in-memory /         sent_emails_log,    reads due
 ingestion_jobs        categories                                  rendered at          replies, calls       rows from
                                                                      send time)          EmailProvider      email_sequences
```

Layers 1–4 are triggered by events (a file lands, a lead needs categorizing, a deck needs
generating). Layers 5–6 are driven by the scheduler on a recurring cadence — the scheduler is
effectively the "clock" that decides when a queued lead actually gets emailed.

---

## 1. Ingestion Layer — implemented (Phase 1)

**Responsibility:** turn ZIP / PDF / CSV / XLSX files and Google Drive links (including nested
folders) into rows in `leads`, deduplicated against every lead ever seen.

- `POST /api/ingestion/upload` (multipart) and `POST /api/ingestion/drive` (`{ url }`) each
  create one `ingestion_jobs` row and enqueue a BullMQ job (`ingestion` queue,
  `Backend/src/queue/`), then return `202` immediately — parsing never runs inline on the
  request, per the "background job, not blocking the API" requirement.
- Uploads are staged through a small `StorageProvider` abstraction
  (`Backend/src/storage/`) — R2 in production, local disk by default for zero-friction local
  dev — mirroring the EmailProvider/AIProvider pattern, switched via `STORAGE_PROVIDER`.
- **Google Drive auth** is a shared service account (confirmed with the user over OAuth2/API-key
  alternatives): each source folder/file is shared with the service account's email address like
  any other collaborator. See `Backend/src/integrations/googleDrive/driveClient.ts`.
- ZIPs are expanded recursively (nested zips included) with a depth guard
  (`ZIP_MAX_RECURSION_DEPTH`); Drive folders are traversed recursively with their own depth
  guard, and native Google Docs/Sheets are exported to PDF/XLSX before parsing.
- CSV/XLSX headers are fuzzy-matched to known lead fields (`columnMapper.ts`) — an ambiguous
  match (two headers both plausibly claiming the same field, or vice versa) is left unmapped and
  logged rather than guessed. No confident email column means the file/sheet is skipped
  entirely (an email is required to write any row at all).
- PDFs: text is extracted first; a line-heuristic looks for a table-shaped block with a
  confident email column (`pdfParser.ts`) — every row that heuristic produces is tagged
  `needs_review` (PDF table extraction here is not a real table-detection library, just a
  best-effort heuristic). Text that doesn't resemble a table is handed off to
  `AIProvider.extractLeadFieldsFromText()` — the interface exists now but every implementation
  is stubbed until Phase 2, so today this always becomes a job-level `review_items` entry rather
  than a row. A PDF with no usable text layer at all is flagged `pdf_scanned_needs_ocr` (OCR
  itself is not implemented).
- Every extracted row is normalized (`email` → `lower(trim(email))`) and written via
  `leadsRepository.upsertLead` — `INSERT ... ON CONFLICT (email_normalized) DO NOTHING`, and on
  conflict, a row-locked merge that only fills blank fields, never overwrites existing non-blank
  data (`normalize.ts#computeMergePatch`, unit tested). A row whose extraction was uncertain
  (ambiguous mapping, PDF heuristic/AI path) is written with `status = 'needs_review'` and is
  never auto-promoted into the active pipeline.
- A malformed row/file (missing/invalid email, unparseable zip/csv/xlsx/pdf) is caught, logged
  into `ingestion_jobs.error_details` with enough context to fix the source, and processing
  continues with the next file — one bad file must not fail an entire batch. Drive-specific
  failures are classified: a permission-denied subfolder is logged and skipped (siblings still
  process); an expired/invalid service account or an exhausted-retry rate limit fails the whole
  job (retrying file-by-file wouldn't help since the same problem would hit every next call).
- `ingestion_jobs.files_processed` / `total_files_discovered` are updated incrementally as the
  job runs (both upload and Drive paths compute the full leaf-file count up front, before
  marking the job started), so a caller polling `GET /api/ingestion/jobs/:id` sees real
  progress, not just a final result.
- On completion, `ingestion_jobs.status` moves to `completed`, `failed`, or `partial`, and the
  job row itself doubles as the run summary — leads created, leads merged, and rows flagged for
  review are all counters on it (see `Docs/DATABASE_SCHEMA.md` § ingestion_jobs).

## 2. Categorization Layer — implemented (Phase 2)

**Responsibility:** assign each lead a primary category (used for deck/email personalization)
plus up to 2 secondary categories, via a hybrid rule-based + AI engine.

- **Trigger:** `leadWriter.writeLeadRow` (Phase 1) enqueues a `categorization` BullMQ job for
  every brand-new lead landing in status `new` (not for `needs_review` leads — those aren't
  "confirmed" yet, and not for merges into an existing lead). Also re-runnable on demand via
  `POST /api/categorization/leads/:id/recategorize` (single) or
  `POST /api/categorization/recategorize` (bulk, by explicit `leadIds` or by current `status`) —
  e.g. after tuning `categorization_rules`. See `Backend/src/routes/categorization.ts`.
- **Rule engine first** (`Backend/src/modules/categorization/ruleEngine.ts`): a pure function,
  no DB/AI calls, that scores every category by summing the weights of its matched
  `categorization_rules` rows (capped at 1.0/category). Rules are **data, not code** — a keyword
  or regex pattern against one of `industry` / `company_name` / `website` / `raw_data` / `any`
  (all four concatenated). Editing the rule set is a SQL `UPDATE`/`INSERT`, never a deploy. A
  category scoring ≥ 0.5 is a confident primary match; ≥ 0.3 but below that is a secondary
  candidate. The seed rule set (`Backend/src/db/migrations/0002_categorization.sql`) is an
  agent-proposed, user-confirmed starting point — expected to be tuned against real lead data.
- **AI fallback** (`Backend/src/modules/categorization/categorizationService.ts`) only runs when
  the rule engine finds no confident primary. It calls `AIProvider.categorizeLead()` (implemented
  for real in this phase — see `Backend/src/providers/ai/`, both Gemini and OpenAI) with the
  lead's fields and the full active category list, and validates the response: JSON-parses it,
  checks it against a zod schema, and — critically — rejects any returned category id that isn't
  in the candidate list it was given (guards against a hallucinated id ever reaching the DB). An
  AI result below `AI_CATEGORIZATION_MIN_CONFIDENCE` (default 0.5) is **not trusted** — the lead
  goes to `needs_review` (`review_reason = 'ai_categorization_low_confidence'`), never guessed.
- **Secondary categories** are stored in `lead_secondary_categories` (a lead can match more than
  one category); when both a rule-based secondary and an AI-reported secondary exist, they're
  merged and deduplicated by confidence, capped at 2.
- **Error handling:** the categorization worker (`Backend/src/queue/workers/categorizationWorker.ts`)
  retries a failed AI call (network/timeout/malformed response) via BullMQ backoff (3 attempts).
  Only on the final exhausted attempt does it mark the lead `needs_review`
  (`review_reason = 'ai_categorization_failed'`) — never blocking the pipeline, never guessing.
  A missing/invalid API key (`AIConfigError`) skips straight to that outcome without wasting the
  retry window, since retrying a config error can't ever succeed.
- **Status transitions:** a lead in a pre-categorization status (`new`, `needs_review`) advances
  to `categorized` (success) or `needs_review` (uncertain/failed). A lead already further along
  the pipeline (`deck_generated`, `in_sequence`, ...) keeps its status untouched even when
  manually re-categorized — only its category/confidence fields refresh, so re-running
  categorization after a rule change can't silently reset pipeline progress.

## 3. Deck Generation Layer — implemented (Phase 3)

**Responsibility:** produce a personalized PPTX pitch deck per lead, tailored to the lead's
primary category, and store it durably.

- **Template-based, not AI-generated.** Phase 0's doc speculated an AI-tailored-copy approach;
  what Phase 3 actually needed (per the explicit requirement) is structural personalization —
  company name in the opening/closing slides, the "Our Services" section reordered/highlighted
  by category — not novel per-lead prose. So this layer makes **no AI provider call at all**: it
  builds a 12-slide deck with `pptxgenjs` from static content extracted from the reference deck
  (`NEW_PITCH_DECK.pdf`) plus the two personalized slides. See `Backend/src/modules/deckGeneration/`:
  - `brand.ts` — colors pixel-sampled from the reference deck's logo asset (`#FB8500` orange,
    `#219EBC` teal — more precise than the "-ish" hex values originally proposed).
  - `staticContent.ts` / `serviceCatalog.ts` — copy extracted verbatim from the reference deck.
  - `slides/*.ts` — one module per slide, each a pure `(slide, ctx) => void` function, so
    templates/branding can be revised slide-by-slide without touching the orchestrator.
  - `deckBuilder.ts` — assembles all 12 slides into a `Buffer` (`pptx.write({ outputType:
'nodebuffer' })`).
- **Personalization**: `coverSlide.ts` and `thankYouSlide.ts` insert the lead's company name;
  `ourServicesSlide.ts` calls the pure, unit-tested `orderCategoriesForLead()` to move the
  lead's primary category card to the front and visually highlight it ("Recommended For You"
  badge, thicker border) — the other 3 categories keep their original relative order. Every
  other slide (About Us, Our Story, Success Stories, How Can We Help, Technology Solutions,
  Creative Services detail, Why Choose Us, How We Work, Major Wins, contact info) is byte-for-
  byte identical across every deck.
- **Known simplifications** (no image assets were available to embed losslessly): client logos
  on the Success Stories slide render as a name-badge grid instead of actual logo images; the
  circular "Our Story" founder-journey diagram renders as a numbered grid instead of a literal
  circular layout with connector arcs. Both are flagged in code comments as easy to upgrade once
  logo/graphic assets exist — the modular slide-per-file structure means swapping either one out
  doesn't touch anything else.
- **Trigger**: `categorizationService.categorizeLead()` calls `deckGenerationService.
triggerDeckGeneration()` whenever categorization actually _changes_ the lead's primary
  category (first-time categorization, or a correction — never a no-op re-confirmation, and
  never when the outcome is `needs_review`). `triggerDeckGeneration()` validates the lead has a
  category, creates the `pitch_decks` row (`generation_status = 'pending'`), and enqueues the
  job — all _before_ returning, so the worker always has an existing row to progress through
  `pending → generating → ready/failed`, including across retries. Manual regeneration
  (`POST /api/decks/leads/:id/regenerate`) goes through the exact same function.
- **Decoupling — "must not crash the pipeline that triggered it"**: deck generation runs on its
  own BullMQ queue/worker (`deck-generation`, `Backend/src/queue/workers/deckGenerationWorker.ts`),
  a separate process context from the categorization worker. `maybeTriggerDeckGeneration()` in
  categorizationService wraps the trigger call in try/catch and only logs on failure — even
  failing to _enqueue_ a deck job can't fail the categorization job that triggered it, and
  actual generation/upload failures happen in an entirely different job that can only fail
  itself.
- **Error handling**: on any failure (bad template data, storage upload failure), the worker
  retries via BullMQ backoff (3 attempts); each attempt updates `pitch_decks.generation_status`
  to `failed` with `generation_error` (so a currently-failed state is always visible, not
  swallowed), and only once retries are exhausted does the _lead_ also move to `needs_review`
  (`review_reason = 'deck_generation_failed'`) — flagging it for manual regeneration, per the
  requirement. A lead with no category yet (`DeckGenerationPreconditionError`) skips retries
  entirely, same non-retryable pattern as `AIConfigError` in categorization. Non-regressive: a
  lead already past `categorized` (e.g. `in_sequence`) never has its status touched by a deck
  failure or even a successful regeneration — only `pitch_decks` reflects the outcome.
- **Storage**: uploaded via the Phase 1 `StorageProvider` abstraction (R2 in production, local
  disk in dev) under `pitch-decks/{leadId}/{pitchDeckId}.pptx`. `pitch_decks.file_url` resolves
  to the R2 public URL when `R2_PUBLIC_URL` is configured, otherwise falls back to this
  backend's own `GET /api/decks/:id/download` route — provider-agnostic either way.
- On success, `leads.status` moves `categorized` → `deck_generated`.

## 4. Email Composer — implemented (Phase 4)

**Responsibility:** render the actual subject/body for a given send (new / follow-up / final),
provider-agnostically, before handing off to the Sending Engine.

- **AI-generated copy, fixed template shell.** `Backend/src/modules/emailComposer/composerService.ts`
  calls `AIProvider.generateEmailCopy()` (implemented for real in Phase 4 — both Gemini and
  OpenAI, mirroring categorizeLead's pattern) for subject + body paragraphs only — the model
  never touches structural HTML. `emailTemplate.ts` wraps whatever copy it gets (AI or fallback)
  in a fixed shell: greeting, paragraphs, signature block (`BeBeyond Digital Solutions,
info@bebeyond.digital, +91 99 1867 1867`), and an unsubscribe footer — **always present**,
  regardless of what the copy source produced. All interpolated text (AI output, lead-controlled
  fields like company/contact name) is HTML-escaped (`escapeHtml()`), since ingested lead data
  is untrusted input being inserted into HTML.
- **AI failure falls back to a static template, never blocks a send.** If `generateEmailCopy()`
  throws for any reason, `composerService.ts` catches it, logs a warning, and uses
  `fallbackTemplates.ts` — on-brand, honest copy per stage that never claims anything false
  (e.g. never says "attached" when nothing is attached this phase).
- **Per-stage tone**, encoded in the shared prompt (`Backend/src/providers/ai/prompts/emailCopy.ts`):
  `new` introduces BeBeyond and the lead's primary category; `followup` (day 3) references the
  prior email without repeating the full pitch; `final` (day 7) is a clear, polite, low-pressure
  close. Positioning baked into every prompt: "your digital partner, not a typical agency —
  transparent pricing, real results, long-term support."
- **Unsubscribe link**: stateless, HMAC-signed (`modules/emailComposer/unsubscribeToken.ts`) —
  `token = HMAC-SHA256(UNSUBSCRIBE_SECRET, leadId)`, verified with `timingSafeEqual`. No DB
  column or lookup needed. `GET /unsubscribe/:leadId/:token` (public, clicked from an email
  client) marks the lead `do_not_contact` unconditionally (the one status transition in this
  codebase that always wins, regardless of current pipeline stage) and best-effort calls
  `EmailProvider.handleUnsubscribe()` for provider-level suppression too.
- **Text-only this phase** — no deck attachment (see `Docs/DATABASE_SCHEMA.md` § pitch_decks);
  wiring `SendEmailParams.attachments` from a lead's `pitch_decks.file_key` is later work.
- Output is a plain `{ subject, html, text }`-shaped object — the composer has no knowledge of
  which email provider will actually send it. That boundary is what makes the provider
  abstraction in the next layer possible.

## 5. Sending Engine (provider abstraction) — implemented (Phase 4, extended Phase 5)

**Responsibility:** actually send the composed email and detect replies, through a single
interface that hides Brevo vs. Gmail entirely from the rest of the system.

### The `EmailProvider` interface

Defined once, in `shared/src/types/email.ts`, and implemented per provider in
`Backend/src/providers/email/`:

```ts
interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  checkReplies(): Promise<ReplyEvent[]>; // polling-style; webhook-driven providers may no-op here
  handleWebhookEvent(payload: unknown): Promise<Array<ReplyEvent | BounceEvent>>; // push-driven inbound
  handleBounce(payload: unknown): Promise<BounceEvent>;
  handleUnsubscribe(email: string): Promise<UnsubscribeResult>; // best-effort provider-level suppression
  getProviderName(): 'brevo' | 'gmail';
}
```

- **`BrevoProvider`** (active, Phase 4): sends via the official `@getbrevo/brevo` SDK's
  `transactionalEmails.sendTransacEmail()` (transactional API v3 under the hood). Sending
  address confirmed with the user: `info@bebeyond.digital` — **SPF/DKIM/DMARC verification in
  Brevo was not confirmed at build time; verify in Senders & IP > Domains before real (non-test)
  sends.** `handleUnsubscribe()` blacklists the contact via Brevo's contacts API (falls back to
  creating one if it 404s — expected for transactional-only senders); our own DB
  (`leads.status = 'do_not_contact'`) is authoritative regardless of whether this call succeeds.
  `checkReplies()` is a no-op (Brevo is webhook-driven via Inbound Parse, not poll-driven).
  `handleWebhookEvent()`/`handleBounce()` are implemented as best-effort payload parsers — **not
  yet verified against a live Brevo payload** (the webhook route is wired up as of Phase 5 — see
  below — but the payload shape itself is only confirmable once DNS is live and a real reply/
  bounce/unsubscribe has been received end-to-end).
- **`GmailProvider`** (stubbed): **fails immediately at construction** — not just when a method
  is called — throwing `GmailNotImplementedError` with a clear message. `providers/email/index.ts`
  exposes `assertEmailProviderReady()`, called eagerly at process startup in both `index.ts` (API
  server) and `queue/startWorkers.ts` (worker process): if `EMAIL_PROVIDER=gmail` is set before
  it's wired up, the process exits immediately at boot with a clear log line, rather than
  crashing unexpectedly deep in a queue job's error log the first time something tries to send.
- A factory (`getEmailProvider()`) reads `EMAIL_PROVIDER` from `.env` once at startup and
  returns the matching implementation. **No other code in the system imports `BrevoProvider` or
  `GmailProvider` directly** — everything downstream (the sending service, the composer's
  caller, the unsubscribe route) depends only on the `EmailProvider` interface. Switching
  providers is a `.env` change, not a code change (plus completing the Gmail stub).

### Dedup — a hard gate, not a convention

"Never send to an address that has received any email from us, ever, across any sequence
stage" is enforced at three layers before `sendingService.sendSequenceEmail()` ever calls the
provider (see `Backend/src/modules/sendingEngine/sendingService.ts`):

1. **Status eligibility.** A lead must be in a status that's actually eligible for the
   requested stage (`new` requires `deck_generated` specifically as of Phase 5 — see below;
   `followup`/`final` require `in_sequence`). A lead that's `do_not_contact`, `bounced`,
   `replied`, or `completed` is eligible for _nothing_ — structurally, not by convention.
2. **Cross-lead collision check** (`findCrossLeadSendCollision`): confirms no _other_ lead
   sharing this normalized email has ever been sent anything — defense in depth beyond
   `leads.email_normalized`'s `UNIQUE` constraint, since "never, ever" is treated literally
   rather than assumed to hold from a constraint alone.
3. **`claimSendAttempt()` — the DB-level race-safety primitive.** `sent_emails_log` gained a
   `UNIQUE (lead_id, sequence_stage)` constraint in Phase 4 specifically for this: `INSERT ...
ON CONFLICT (lead_id, sequence_stage) DO NOTHING RETURNING id` — Postgres's unique index
   guarantees exactly one concurrent INSERT can ever win. On conflict, the existing row is
   locked with `SELECT ... FOR UPDATE`; only a row in `'failed'` status is eligible for a
   legitimate retry (reset to `'queued'`, `retry_count` incremented) — `'queued'`/`'sending'`
   means another attempt is in flight right now, `'sent'` means it's already done, and either
   way this caller does not send. The row lock means two concurrent _retry_ attempts can't both
   win either. This is unit-tested under genuine concurrent execution (a mutex-backed fake
   reproducing the same claim contract, since no live Postgres is available in this environment
   — see `modules/sendingEngine/__tests__/concurrency.test.ts` for exactly what is and isn't
   proven by that test).

### Deck attachment (Phase 5)

`'new'`-stage sends now attach the lead's generated pitch deck (Layer 3). `sendSequenceEmail()`
tightened `ELIGIBLE_STATUSES_BY_STAGE.new` to `['deck_generated']` only (previously also allowed
`'categorized'`) — a ready deck is now a hard precondition for a `'new'` send, not optional.
Before claiming a send, it fetches the lead's latest `pitch_decks` row via
`getLatestPitchDeckForLead()`, requiring `generation_status = 'ready'` and a non-null `file_key`
(a `SendPreconditionError` otherwise, non-retryable — the same pattern as every other
precondition check here). The deck's id is snapshotted onto the `sent_emails_log` row
(`pitch_deck_id`, mirroring the existing `category_id` snapshot) so the audit trail records
exactly which deck version went out. The actual bytes are fetched from `StorageProvider.getObject()`
and attached via `SendEmailParams.attachments` right before the provider call, not any earlier —
downloading a multi-MB pptx has no reason to happen before the mid-flight re-check below has
passed.

### The reply-during-send race (Phase 5)

The requirement: a reply, bounce, or unsubscribe that lands **after** a follow-up/final send job
was already claimed must still stop that send. Two checks make this hold:

1. **At job start** (already true since Phase 4, just newly load-bearing): `sendSequenceEmail()`
   reads the lead's status fresh from the DB, not from whatever data existed when the BullMQ job
   was enqueued. So if a reply arrives while a job is _sitting in the queue_ (not yet started),
   the eligibility check at the top of the function already sees the updated status and throws
   `SendPreconditionError` before doing anything else.
2. **Immediately before `provider.sendEmail()`** (new in Phase 5): after `claimSendAttempt()` has
   won the race and `composeEmail()` has run — the one genuinely slow step in this function, since
   it may call an AI provider — the lead's status is read again. If it's no longer eligible (a
   reply/bounce/unsubscribe landed during composition), the send is aborted: `sent_emails_log`
   is marked `'cancelled'` (a status distinct from `'failed'` — this send was never attempted,
   not attempted-and-rejected) and `daily_summary.cancelled_count` is incremented. No provider
   call is ever made.

Check 2 is the one that closes a real, previously-unprotected gap — without it, a follow-up job
that got claimed and started composing microseconds before a reply webhook fired would still
send, ignoring the reply entirely. See `modules/sendingEngine/__tests__/replyRace.test.ts` for
the explicit concurrency test proving this. A zero-width race remains theoretically possible once
the HTTP call to the provider is actually in flight (nothing can be cancelled mid-network-call),
but that gap cannot be closed from this side regardless of provider.

### Reply/bounce/unsubscribe tracking (Phase 5)

`modules/replyTracking/replyTrackingService.ts` is the single place that turns a normalized
`ReplyEvent`/`BounceEvent` (from the `EmailProvider` interface — never anything Brevo-specific)
into lead-status and sequence-state changes:

- **Reply** (`recordReplyEvent`): looks up the lead by normalized `fromEmail`, records a `replies`
  row, sets `leads.status = 'replied'` (unless already `'do_not_contact'` — an opt-out always
  wins, never reopened by a later reply), and calls `stopSequenceForLead(leadId, 'stopped_reply',
...)`.
- **Bounce** (`recordBounceEvent`): sets `leads.status = 'bounced'` (same do_not_contact
  precedence) and stops the sequence as `'stopped_bounce'`.
- **Unsubscribe** (`recordUnsubscribeEvent`): sets `leads.status = 'do_not_contact'`
  unconditionally and stops the sequence as `'stopped_unsubscribe'` — its own terminal stage,
  kept distinct from `'stopped_bounce'` so an opt-out is never misreported as a delivery failure
  in `email_sequences`/audit queries.
- **`stopSequenceForLead()`** (`db/repositories/emailSequencesRepository.ts`) is idempotent: it
  only updates a sequence whose `current_stage` isn't already one of the four terminal
  `stopped_*`/`completed` values, so duplicate webhook delivery or an out-of-order event can
  never downgrade or overwrite an earlier terminal reason.

**Entry points**, both funneling into the same handlers above — this is what makes the
provider-switch design goal hold:

- `routes/webhooks.ts` — real-time push delivery. `POST /webhooks/brevo/inbound/:secret` (Brevo
  Inbound Parse, replies) and `POST /webhooks/brevo/events/:secret` (Brevo transactional events —
  bounces, blocks, unsubscribes). Both call `provider.handleWebhookEvent(payload)` then dispatch
  each normalized event via `handleProviderEvent()`. Auth is a high-entropy secret embedded in the
  URL path (Brevo doesn't HMAC-sign these payloads) verified with `timingSafeEqual`; anything
  that fails to parse is caught and logged, never crashes the process or causes a retry storm
  (see Docs/BREVO_INBOUND_SETUP.md for the DNS/dashboard setup this requires).
- `replyTrackingService.syncRepliesFromProvider()` — polling-style entry point, called by the
  Daily Scheduler's step 1. Calls `provider.checkReplies()`. For Brevo this is a documented no-op
  (`[]`, webhook-driven) — real-time delivery via the webhook route above is what actually does
  the work today. This function exists so a **future Gmail implementation** (`users.watch` +
  Pub/Sub, batched) needs zero scheduler or lead-status-logic changes — only `checkReplies()` on
  `GmailProvider` needs implementing, exactly the provider-switch goal this phase was scoped to.

### Error handling (applies to sending, webhook receipt, and every other external call)

This is the layer where a silent failure is most costly — a swallowed error here means a lead
is never contacted and nobody finds out.

1. **Never fail silently.** `BrevoProvider.sendEmail()` classifies every failure into
   `EmailApiError` (`retryable: boolean`, based on HTTP status — 429/5xx are retryable; 4xx like
   bad request/invalid recipient/auth are not) or lets a `EmailConfigError`
   (missing API key/sender) propagate — both logged with the lead id and stage.
2. **Persist status, not just logs.** Every attempt updates `sent_emails_log.status` /
   `error_message` (`markSendResult`), so "which sends failed and why" is queryable, not buried
   in server logs.
3. **Retry where appropriate, via BullMQ.** The `email-send` queue's worker
   (`queue/workers/sendingWorker.ts`) retries transient failures 3× with exponential backoff,
   and is rate-limited (`limiter: { max, duration }`, from `EMAIL_SEND_RATE_LIMIT_MAX`/
   `_DURATION_MS` — a conservative default for Brevo's free tier) so send throughput respects
   Brevo's API limits.
4. **Distinguish retryable from terminal failures — and never silently advance the sequence.**
   A `SendPreconditionError` (wrong lead status, no category, dedup collision) or a non-retryable
   `EmailApiError` skips straight to failure handling, skipping the retry window entirely (same
   pattern as `AIConfigError`/`DeckGenerationPreconditionError` in earlier phases). Either way,
   once retries are exhausted (or skipped), `markSendFailed()` moves the lead to `needs_review`
   (`review_reason = 'email_send_failed'`) — the sequence's `stage_*_sent_at`/`current_stage`
   are **never** advanced on failure, so a failed send can never look like a successful one.

## 6. Daily Scheduler — implemented (Phase 5)

**Responsibility:** decide, once per run, exactly which emails go out today, respecting the
300/day cap with follow-ups and finals prioritized over new outreach — with zero manual
intervention required day-to-day.

`modules/scheduler/dailySchedulerService.ts`'s `runDailyScheduler()` runs these steps, in order,
every time it's invoked:

1. **Reply-check sync** — `replyTrackingService.syncRepliesFromProvider()`. A no-op for Brevo
   today (see Layer 5) since replies already arrive via webhook in real time; kept as its own
   step so a future poll-based provider needs no scheduler changes.
2. **Due follow-ups** — `emailSequencesRepository.listDueFollowups(now)`:
   `current_stage = 'followup' AND stage_followup_sent_at IS NULL AND
stage_followup_scheduled_at <= now()`. (The original Phase 0 index predicate checked
   `current_stage = 'new'`, which could never match — `markStageSent()` already advances
   `current_stage` to `'followup'` the instant the `'new'` email is sent. Fixed in
   `migrations/0004_scheduler.sql`, since this is the first migration to actually query it.)
3. **Due finals** — `listDueFinals(now)`, same shape: `current_stage = 'final' AND
stage_final_sent_at IS NULL AND stage_final_scheduled_at <= now()`. `stage_final_scheduled_at`
   was computed from the _original_ `'new'` send at day 0 (see `markStageSent`), never
   recomputed from the follow-up send — so "day 7 from the original email" holds regardless of
   exactly when the follow-up actually went out.
4. **New-eligible leads** — `leadsRepository.listLeadIdsByStatus('deck_generated', limit)`.
   `'deck_generated'` alone already means categorized + deck ready + never emailed + not
   opted-out/bounced/replied, since those are all mutually exclusive `leads.status` values —
   no additional filtering needed.
5. **300/day cap** (`DAILY_EMAIL_LIMIT`), follow-ups + finals always win in full:
   `alreadyClaimedToday = countSentToday(dayStart, dayEnd)` (day boundary computed in
   `SCHEDULER_TIMEZONE`, see `dailySummaryRepository.getDayBoundsInSchedulerTimezone`) →
   `priorityCount = dueFollowups.length + dueFinals.length` → if
   `alreadyClaimedToday + priorityCount > DAILY_EMAIL_LIMIT`, **all** deadline-bound emails are
   still queued (never silently dropped) and `priority_exceeded_cap` is logged `true` with a
   warning; new-lead queueing gets whatever's left (`max(0, limit − alreadyClaimedToday −
priorityCount)`), possibly zero.
6. **Enqueue** — each selected lead is enqueued via the existing Phase 4 `enqueueSendEmailJob()`
   (`email-send` queue) exactly as `POST /api/sending/leads/:id/send-now` does manually. Nothing
   about the sending engine itself needed to change for automation — the scheduler is just
   another caller of the same queue.
7. **`daily_summary` audit row** — one row per `run_date` (upserted, see `recordSchedulerRun`):
   queued counts per stage (this run's own snapshot — overwritten on re-run, not summed),
   `skipped_reply`/`skipped_bounce`/`skipped_optout` (from
   `emailSequencesRepository.countStoppedInRange`, since sequences already stopped for those
   reasons are silently excluded from steps 2-3's results and this is where that gets surfaced
   for audit), `priority_exceeded_cap`, and `scheduler_errors` (a JSON array of any step failures
   — see idempotency below). `new_sent`/`followup_sent`/`final_sent`/`failed_count`/
   `cancelled_count` are **not** written here — they're incremented live by
   `sendingService.sendSequenceEmail()` itself as each queued send actually resolves (the
   scheduler enqueues asynchronously and cannot know final outcomes synchronously at the end of
   its own run), for _any_ send that resolves that day, scheduler- or manually-triggered. See
   `dailySummaryRepository.ts`'s module doc.

### Automation

A BullMQ repeatable job (`queue.upsertJobScheduler`, registered idempotently at worker startup in
`queue/startWorkers.ts`) fires `runDailyScheduler()` once a day on `SCHEDULER_CRON` (default
`0 9 * * *`) evaluated in `SCHEDULER_TIMEZONE`. Once the worker process is running, this requires
no further action — the stated Phase 5 goal. `POST /api/scheduler/run-now`
(`routes/scheduler.ts`) exists purely for manual testing, exactly like Phase 4's send-now
endpoint; it doesn't change the fact that normal operation is fully automated.

### Idempotency (safe to re-run after a partial crash)

If `runDailyScheduler()` throws or the process crashes partway (e.g. after step 3), re-running it
— whether the next day's repeatable job or a manual re-trigger — is always safe:

- Every enqueue in step 6 ultimately calls `sendSequenceEmail()`, which claims via
  `claimSendAttempt()`'s `UNIQUE (lead_id, sequence_stage)` constraint (Phase 4) before ever
  composing or sending — a duplicate enqueue for a (lead, stage) that already sent, or is
  in-flight, is always a clean no-op, never a duplicate send.
- Steps 2-4's due/eligible queries are recomputed fresh from current DB state every run — a lead
  already sent today (its `stage_*_sent_at` is now set, or its status has moved past
  `'deck_generated'`) simply won't reappear in the next run's results.
- Individual step failures inside `runDailyScheduler()` are caught per-step (not one big
  try/catch around everything) so one failing step (e.g. the reply-sync call) doesn't prevent
  the remaining steps from running — each failure is appended to the `errors` array and
  persisted to `daily_summary.scheduler_errors` rather than aborting the whole run.

---

## 7. Dashboard — implemented (Phase 6)

**Responsibility:** give a human a way to operate and audit the pipeline without touching the
database or server logs directly. UI-only by design — the dashboard owns no business logic; it
is a thin client over the backend's HTTP API, same as any external API consumer would be.

**Stack:** Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui (Radix UI primitives, "Nova" preset
— Lucide icons, Geist font), TanStack Query (data fetching, polling, mutations), TanStack Table
(the leads table), Recharts (via shadcn's chart wrapper, for the Daily Summary trend charts).
Every page is a client component (`'use client'`) calling `NEXT_PUBLIC_API_URL` through
`Frontend/lib/api-client.ts`; there is no server-side data fetching in this phase (no auth layer
exists yet to protect it, and every page's data is inherently per-request/live, not something
worth statically generating).

**Pages** (`Frontend/app/`):

1. **System Status** (`/`, home) — active `EMAIL_PROVIDER`/`AI_PROVIDER`, plus counts + recent
   items for every failure surface already tracked by prior phases: failed sends, failed deck
   generations, failed/partial ingestion jobs, and `needs_review` leads. Polls every 15s. This is
   the "don't make me dig through server logs" requirement — `GET /api/system/status`
   (`modules/systemStatus/systemStatusService.ts`) aggregates all four sources in one call.
2. **Ingestion** (`/ingestion`) — file upload + Google Drive link forms (existing Phase 1
   endpoints), a recent-jobs table that polls every 3s while any job is `pending`/`processing`,
   and a **needs-review queue**: every lead with `status = 'needs_review'`, editable inline
   (company/contact/phone/website/industry/country/region), with a "Confirm & Re-queue" button
   that applies the edit and re-runs categorization in one action
   (`modules/leads/leadReviewService.ts#confirmLead`).
3. **Leads** (`/leads`, `/leads/[id]`) — a filterable/searchable/paginated table (status,
   category, sequence stage, free-text search) backed by `GET /api/leads`; the detail page adds
   per-lead sequence position + stage dates, pitch deck status/download, sent-email history, and
   manual action buttons (recategorize, regenerate deck, send-now per stage) — all reusing
   existing Phase 2–5 endpoints, not new pipeline logic.
4. **Sent Email Log** (`/sent-emails`) — every send across every lead (not scoped to one lead,
   unlike the Phase 4 per-lead log), filterable by status/provider/stage/category, searchable by
   lead email/company.
5. **Daily Summary** (`/daily-summary`) — `daily_summary` rows over a selectable date range,
   visualized as a stacked-by-stage sent-volume chart and a replies/bounces/opt-outs trend line,
   plus the raw per-day table and a manual "Run scheduler now" button (Phase 5's existing
   `POST /api/scheduler/run-now`, exposed here instead of only via curl).
6. **Replies** (`/replies`) — every reply, body text shown inline (not just a "replied" flag),
   with a show-more toggle for long bodies, linked back to the originating lead.

**Near-real-time updates:** polling via TanStack Query's `refetchInterval`, not websockets/SSE —
sufficient for an internal ops tool where a few seconds of staleness is fine, and far simpler to
reason about than a push channel. Ingestion jobs poll only while something is actually in
progress (`refetchInterval` returns `false` once every job is terminal); System Status polls on a
fixed 15s cadence regardless, since new failures can appear at any time from background workers.

**Query defaults worth knowing** (`app/providers.tsx`): `retry: false` and
`networkMode: 'always'`. TanStack Query's default (`retry: 3`, `networkMode: 'online'`) is tuned
for a general internet-facing app talking to unpredictable third-party APIs; this dashboard talks
to exactly one backend it controls, so retrying doesn't add resilience, just delay. More subtly,
TanStack Query v5's retry-continuation is gated on `document` focus
(`focusManager.isFocused()`) independent of `networkMode` — a backgrounded/unfocused tab can
leave a query stuck at `fetchStatus: 'paused'` indefinitely, never reaching an error state, if a
retry is queued while unfocused. Not retrying sidesteps that gate entirely: the first attempt
only depends on `networkMode`, never on focus, so a dead backend surfaces as a real, visible
error within one request instead of hanging.

**New backend endpoints added this phase** (dashboard is UI-only in spirit, but these were
genuinely missing — no general lead-listing, global sent-log, daily-summary range, or replies
endpoint existed before Phase 6):

- `GET /api/leads`, `GET /api/leads/:id`, `PATCH /api/leads/:id`, `POST /api/leads/:id/confirm`
- `GET /api/categorization/categories`
- `GET /api/sending/logs`
- `GET /api/scheduler/daily-summary`
- `GET /api/replies`
- `GET /api/system/status`

Building these also surfaced a real bug (not dashboard-specific): the new `listLeads`/
`listSentEmailLogs`/`listReplies` JOIN queries initially reused the existing per-table bare
column-list constants (`LEAD_COLUMNS`, `LOG_COLUMNS`, `REPLY_COLUMNS`), which are safe for
single-table queries but ambiguous across a JOIN — `leads`, `categories`, `email_sequences`, and
`sent_emails_log` all have their own `id`/`created_at`/`updated_at` columns (and `leads`/
`sent_emails_log` both have `status`), which Postgres rejects as an ambiguous column reference at
query time. Fixed with dedicated `*_LIST_COLUMNS` constants that fully qualify every column with
its table alias — see the doc comments in `leadsRepository.ts`, `sentEmailsLogRepository.ts`, and
`repliesRepository.ts`.

## Cross-cutting: AI provider abstraction

Structured identically to the email provider abstraction, for the same reason — Gemini and
OpenAI are both explicitly in scope and switchable via `.env`:

```ts
interface AIProvider {
  categorizeLead(input: CategorizeLeadInput): Promise<CategorizeLeadResult>;
  generateDeckContent(input: GenerateDeckContentInput): Promise<GenerateDeckContentResult>;
  getProviderName(): 'gemini' | 'openai';
}
```

`AI_PROVIDER=gemini|openai` selects the implementation via a factory, mirroring
`createEmailProvider()`. Categorization (layer 2) and deck generation (layer 3) both depend
only on the `AIProvider` interface.

## Cross-cutting: Queue topology (BullMQ + Redis)

Separate named queues per concern, so a backlog or failure in one doesn't block another:

- `ingestion` — file/Drive processing jobs. **Implemented (Phase 1)**: single worker,
  `concurrency: 1` (deliberate — avoids two workers racing to merge the same duplicate email at
  once, on top of the row-level lock already in `leadsRepository.upsertLead`), 3 attempts with
  exponential backoff. See `Backend/src/queue/`.
- `categorization` — per-lead categorization jobs. **Implemented (Phase 2)**: `concurrency: 3`
  (no shared-row contention across leads, unlike ingestion), 3 attempts with exponential
  backoff. See `Backend/src/queue/workers/categorizationWorker.ts`.
- `deck-generation` — per-lead deck rendering jobs. **Implemented (Phase 3)**: `concurrency: 2`
  (pptx build + upload is more CPU/IO-heavy per job than categorization), 3 attempts with
  exponential backoff. See `Backend/src/queue/workers/deckGenerationWorker.ts`.
- `email-send` — per-send jobs. **Implemented (Phase 4, now scheduler-driven too as of
  Phase 5)**: `concurrency: 2`, rate-limited (`limiter`, conservative default for Brevo's free
  tier — see `.env`), 3 attempts with exponential backoff. Enqueued both manually via
  `POST /api/sending/leads/:id/send-now` and automatically by the Daily Scheduler (Layer 6). See
  `Backend/src/queue/workers/sendingWorker.ts`.
- `scheduler` — the Daily Scheduler's own queue. **Implemented (Phase 5)**: one repeatable job
  (`upsertJobScheduler`, cron `SCHEDULER_CRON` in `SCHEDULER_TIMEZONE`) plus manual test triggers
  from `POST /api/scheduler/run-now`, `concurrency: 1` (only one scheduler run in flight ever).
  See `Backend/src/queue/workers/schedulerWorker.ts`.

Reply/bounce/unsubscribe webhook payloads (Brevo Inbound Parse + transactional events) are
**not** queued — `routes/webhooks.ts` processes them inline within the HTTP request, since
`replyTrackingService`'s handlers are a handful of fast DB writes, not the kind of slow/bursty
work a queue exists to smooth out. If webhook volume ever grows enough to matter, that route is
the only place that would need to change (enqueue-and-ack instead of process-and-ack) — nothing
about the handlers themselves.

All queues share the same retry/backoff/error-logging conventions described under Sending
Engine's error handling section above.

## Deployment

- **Backend + workers**: Node/Express API and BullMQ workers deployed to Railway, sharing the
  same codebase/process group as configured (separate Railway services for API vs. workers is a
  Phase-1+ operational decision, not a schema/architecture one).
- **Dashboard**: Next.js (App Router) deployed to Railway separately, talking to the backend via
  `NEXT_PUBLIC_API_URL`. **Implemented (Phase 6)** — see § 7.
- **Postgres + Redis**: Railway-managed instances in production; `docker-compose.yml` provides
  the equivalent locally for development.
- **File storage**: Cloudflare R2 (S3-compatible) for generated decks, accessed via the S3 API
  from the backend — no code-level Railway dependency.
