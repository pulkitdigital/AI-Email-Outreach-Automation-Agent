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

## 3. Deck Generation Layer — implemented (Phase 3, re-platformed on `@react-pdf/renderer`)

**Responsibility:** produce a personalized PDF pitch deck per lead, tailored to the lead's
primary category, and store it durably.

- **Template-based, not AI-generated.** Phase 0's doc speculated an AI-tailored-copy approach;
  what this layer actually needs (per the explicit requirement) is structural personalization —
  company name in the opening/closing slides, an "industry" subtitle when known, the "Our
  Services" section reordered/highlighted by category — not novel per-lead prose. So this layer
  makes **no AI provider call at all**.
- **Renders a PDF directly — no LibreOffice, no system binaries.** The original Phase 3
  implementation built a `.pptx` with `pptxgenjs` and converted it to `.pdf` at generation time
  via a `soffice --headless` shell-out (LibreOffice), which meant the production worker needed
  LibreOffice installed via `apt-get` (see `render.yaml`'s git history) and carried real
  deployment risk (a missing/mismatched system binary, font-substitution differences between
  dev and Render's Linux container). That two-step pipeline has been **replaced**: the deck is
  now rendered straight to a PDF buffer with `@react-pdf/renderer`, a pure-JS library — no shell
  process, no system dependency, nothing for Render's build to `apt-get install`. See
  `Backend/src/modules/deckGeneration/pdf/`:
  - `theme.ts` — colors/fonts/spacing/page-size tokens, re-exported from `../brand.ts` (the
    single source of truth for brand values, shared with the old pptxgenjs code below).
  - `fonts.ts` — registers the real Bricolage Grotesque / Public Sans font files (via the
    `@fontsource/bricolage-grotesque` / `@fontsource/public-sans` npm packages, which ship actual
    `.ttf`/`.woff` files in `node_modules` — no runtime network fetch, no third-party font CDN).
  - `icons.tsx` — simple inline SVG icons (arrow-up-trend, gear, megaphone, handshake, star, etc.)
    drawn as basic shapes, not sourced image/icon-font assets.
  - `slides/*.tsx` — one React component per slide (12 total), composed into a single
    `DeckDocument.tsx`.
  - `generateDeckPdf.ts` — `buildDeckPdfForLead(ctx)`, the single entrypoint: registers fonts,
    renders `<DeckDocument ctx={ctx} />` via `renderToBuffer()`, returns `{ buffer, pageCount }`.
  - `brand.ts`'s colors were re-verified directly against a newer reference PDF
    (`Docs/design-reference/pitch-deck-reference.pdf`) using `pdfplumber` to sample real vector
    and character fill colors, not eyeballed off a logo asset: `#FB8500` orange and `#219EBC`
    teal (headings/text) were confirmed exact; a second, distinct muted teal `#2793AD`
    (`tealShape`, used for shape fills like underline bars) was newly identified and added;
    `cream`/`tealPale` were corrected to their verified exact values.
  - `staticContent.ts` was diffed against that same newer reference and corrected where the
    older extraction was stale: the Success Stories client list grew from 18 to a verified
    23 real names (5 were previously missing entirely, one was misspelled), and two slides
    ("Our Services", the merged Creative Services detail) gained subtitle lines that exist in
    the reference but weren't previously captured. Every other section (About Us, founder
    journey, benefit cards, service catalog, comparison table, testimonials) was confirmed
    unchanged/accurate against the newer reference.
- **Personalization**: the Cover slide inserts the lead's company name (`"Prepared for
  {companyName}"`) and, when the lead's `industry` field is populated, a short secondary line;
  the Thank You slide echoes the company name in its closing line; the "Our Services" slide
  reuses the pure, unit-tested `orderCategoriesForLead()` (`serviceCatalog.ts`, unchanged by the
  re-platforming) to move the lead's primary category card to the front and visually highlight
  it ("Recommended For You" badge, tinted background). An unrecognized/missing category slug
  degrades gracefully — no highlight, no crash, categories keep their default order. Every other
  slide is identical across every deck.
- **Known simplifications** (no image assets were available to embed losslessly): client names
  on the Success Stories slide render as a typographic name grid instead of actual logo images;
  the circular "Our Story" founder-journey diagram renders as a numbered list instead of a
  literal circular layout with connector arcs; testimonials render as typed quote-cards instead
  of the reference's chat/review screenshots (quote text verified verbatim against the real,
  longer reviews).
- **Trigger, decoupling, error handling, and storage-provider abstraction are unchanged** from
  the original Phase 3 design (see below) — only the actual rendering step changed:
  `categorizationService.categorizeLead()` calls `deckGenerationService.triggerDeckGeneration()`
  whenever categorization actually _changes_ the lead's primary category; deck generation runs
  on its own BullMQ queue/worker (`deck-generation`,
  `Backend/src/queue/workers/deckGenerationWorker.ts`) so a rendering failure can never crash the
  categorization job that triggered it; on failure the worker retries via BullMQ backoff (3
  attempts), each attempt updating `pitch_decks.generation_status`/`generation_error`, and only
  once retries are exhausted does the lead move to `needs_review`
  (`review_reason = 'deck_generation_failed'`).
- **Storage — one artifact now, not two.** The old pipeline produced both a `.pptx` and a
  LibreOffice-converted `.pdf`, stored under `pitch_decks.file_key`/`file_url` (pptx) and
  `pdf_file_key`/`pdf_file_url` (pdf) respectively. Since generation now produces exactly one
  PDF, the same generated bytes are uploaded once and recorded under **both** column pairs
  (`generateDeckPdf`'s single output written to both `fileKey`/`fileUrl` and
  `pdfFileKey`/`pdfFileUrl`) — every existing reader (the sending engine's attachment logic, the
  dashboard's download links) keeps working unchanged, and no DB migration was needed to merge
  the now-redundant columns (left as a deliberate future cleanup, not bundled into the
  re-platforming). Uploaded via the Phase 1 `StorageProvider` abstraction (R2 in production,
  local disk in dev) under `pitch-decks/{leadId}/{pitchDeckId}.pdf`.
- On success, `leads.status` moves `categorized` → `deck_generated`.
- **The old pptxgenjs + LibreOffice code (`deckBuilder.ts`, `pptxToPdf.ts`,
  `slides/*.ts` at the top level of `deckGeneration/`) is still present in the repo but no longer
  called by anything** — `deckGenerationService.ts` imports only from `pdf/generateDeckPdf.ts`.
  Left in place rather than deleted since removing ~15 files is a deliberate, separate cleanup
  decision, not something to bundle silently into a rendering-engine swap.

## 4. Email Composer — implemented (Phase 4)

**Responsibility:** render the actual subject/body for a given send (new / follow-up / final),
provider-agnostically, before handing off to the Sending Engine.

- **AI-generated copy, fixed template shell.** `Backend/src/modules/emailComposer/composerService.ts`
  calls `AIProvider.generateEmailCopy()` (implemented for real in Phase 4 — both Gemini and
  OpenAI, mirroring categorizeLead's pattern) for subject + body paragraphs only — the model
  never touches structural HTML. `emailTemplate.ts` wraps whatever copy it gets (AI or fallback)
  in a fixed shell: greeting, paragraphs, signature block, and an unsubscribe footer — **always
  present**, regardless of what the copy source produced. All interpolated text (AI output,
  lead-controlled fields like company/contact name) is HTML-escaped (`escapeHtml()`), since
  ingested lead data is untrusted input being inserted into HTML.
- **Sign-off is a person, not just the company** (deliverability fix — a bare company-name
  sign-off reads as agency/bulk mail, one factor pushing cold outreach into Gmail's Promotions
  tab). The signature block is `{SENDER_PERSON_NAME}` on its own line, then `BeBeyond Digital
  Solutions`, then contact info — never the company name alone. `SENDER_PERSON_NAME` (env var,
  default `Pulkit`) is enforced structurally in `emailTemplate.ts`, not left to the AI to
  remember, and is also folded into `BrevoProvider`'s "From" display name (e.g. "Pulkit from
  BeBeyond") for the same reason.
- **AI failure falls back to a static template, never blocks a send.** If `generateEmailCopy()`
  throws for any reason, `composerService.ts` catches it, logs a warning, and uses
  `fallbackTemplates.ts` — on-brand, honest copy per stage that never claims anything false
  (e.g. never says "attached" when nothing is attached this phase). The fallback templates carry
  the same first-person, no-agency-boilerplate tone rules as the AI prompt (below), so an AI
  outage can't silently revert a send to the old promotional-sounding copy.
- **Per-stage tone**, encoded in the shared prompt (`Backend/src/providers/ai/prompts/emailCopy.ts`):
  `new` introduces the sender and the lead's primary category; `followup` (day 3) references the
  prior email without repeating the full pitch; `final` (day 7) is a clear, polite, low-pressure
  close. Positioning baked into every prompt: "your digital partner, not a typical agency —
  transparent pricing, real results, long-term support." The prompt carries explicit hard rules
  (first-person only, never "At BeBeyond, we..."; never open with "I came across [Company] while
  researching..." — reference the lead's actual category/industry data instead; follow-ups must
  vary their closing phrase rather than reusing stock lines like "close the loop" or "won't
  follow up further") plus two real few-shot examples modeling the target voice — added because
  an earlier, unguided version of this prompt reliably produced generic-sounding agency-pitch
  copy that read as promotional rather than a 1:1 email.
- **Follow-up/final subjects continue the same thread, deterministically.** Rather than letting
  the AI (or the fallback template) invent a new subject line for a `followup`/`final` email,
  `composerService.ts` always overrides it to `Re: {the actual subject the 'new' email was sent
  with}` when that's available — fetched via `sentEmailsLogRepository.getSentSubjectForStage()`
  and passed through by `sendingService.ts`'s `composeForLead()`. This is enforced in code, not
  left as a prompt instruction, so a recipient's inbox always shows one continuing conversation
  for a given lead, never three unrelated-looking emails.
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
5. **Daily cap**, follow-ups + finals always win in full:
   `alreadyClaimedToday = countSentToday(dayStart, dayEnd)` (day boundary computed in
   `SCHEDULER_TIMEZONE`, see `dailySummaryRepository.getDayBoundsInSchedulerTimezone`) →
   `priorityCount = dueFollowups.length + dueFinals.length` → if
   `alreadyClaimedToday + priorityCount > limit`, **all** deadline-bound emails are
   still queued (never silently dropped) and `priority_exceeded_cap` is logged `true` with a
   warning; new-lead queueing gets whatever's left (`max(0, limit − alreadyClaimedToday −
priorityCount)`), possibly zero. The cap itself is `DAILY_EMAIL_LIMIT` (default 300), **unless**
   the sending-domain warm-up ramp is enabled (`WARMUP_ENABLED=true` — `bebeyond.digital` has no
   prior sending history, so starting at full volume immediately is a deliverability risk):
   `computeEffectiveDailyLimit(runDate)` (`modules/scheduler/warmup.ts`) then substitutes a
   smaller, growing limit instead — `WARMUP_START_LIMIT * WARMUP_GROWTH_RATE ^
   floor(daysSinceWarmupStart / WARMUP_GROWTH_INTERVAL_DAYS)`, capped at `DAILY_EMAIL_LIMIT` once
   the ramp reaches it. Deliberately a pure function of `(runDate, env config)` — no DB row, no
   persisted "day N of warmup" counter — so a process restart or a re-triggered run can never
   desync the ramp from reality; the same calendar date always produces the same effective limit.
   Disabled by default (`WARMUP_ENABLED=false`), so an existing/already-warmed-up deployment's
   behavior is unchanged unless explicitly opted in.
6. **Enqueue** — each selected lead is enqueued via the existing Phase 4 `enqueueSendEmailJob()`
   (`email-send` queue) exactly as `POST /api/sending/leads/:id/send-now` does manually. Every
   scheduler-enqueued job (not a manual "Send Now") also gets a random `delayMs`, uniformly
   distributed across `SEND_SPREAD_WINDOW_HOURS` (`computeSendSpreadDelayMs()`,
   `modules/scheduler/sendSpread.ts`) — spreading a day's sends across a window instead of firing
   them all back-to-back at `SCHEDULER_CRON` time, since real human-paced sending isn't evenly
   spaced either. `SEND_SPREAD_WINDOW_HOURS=0` disables spreading (every job gets `delayMs: 0`,
   today's send-now-style burst behavior). Independent of, and composes with,
   `EMAIL_SEND_RATE_LIMIT_MAX`/`_DURATION_MS`, which still governs how fast eligible jobs drain
   once each one's spread delay has elapsed.
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

- **Backend + workers**: Node/Express API (`bebeyond-backend-api`) and BullMQ workers
  (`bebeyond-backend-worker`) deployed to **Render** (see repo-root `render.yaml`) as two
  separate services on Render's native Node runtime (not Docker), both on the `starter` plan,
  Singapore region, sharing one env var group so Backend variables are defined once. Both
  services' `buildCommand` is plain `npm install && npm run build:shared && npm run build
  --workspace=Backend` — **no `apt-get`/system-package install step exists**, since the deck
  pipeline is pure JS (`@react-pdf/renderer`, see § 3) and needs no LibreOffice or other system
  binary. An earlier revision of this file did `apt-get install libreoffice-impress` plus font
  packages specifically for the old pptxgenjs+LibreOffice deck pipeline; that line was removed
  once the deck pipeline was re-platformed, since there's nothing left to install for that step.
- **Dashboard**: Next.js (App Router) deployed to Vercel separately (see repo-root
  `vercel.json`), talking to the backend via `NEXT_PUBLIC_API_URL`. **Implemented (Phase 6)** —
  see § 7.
- **Postgres**: [Neon](https://neon.tech) (cloud, `DATABASE_URL`). **Redis**:
  [Upstash](https://upstash.com) (cloud, `REDIS_URL`, `rediss://` for TLS). Both used identically
  in local dev and production — `docker-compose.yml` provides local Postgres/Redis containers as
  an optional alternative for local dev only, never used in production.
- **File storage**: Cloudflare R2 (S3-compatible) for generated decks, accessed via the S3 API
  from the backend (`STORAGE_PROVIDER=r2` in production; ephemeral Render disk means `local`
  storage would lose every deck on redeploy) — no code-level platform dependency.
