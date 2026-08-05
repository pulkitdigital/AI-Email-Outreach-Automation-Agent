# Changelog

Notable changes to this project. Dated by when the change actually landed in the codebase
(verified against source, not when it was discussed) — see `Docs/STATUS.md` for anything that
was discussed but hasn't actually landed yet.

## 2026-08-05

### Email / Deliverability

- **Rewrote outbound email tone** to read as a genuine 1:1 email instead of agency-pitch
  promotional copy — the likely cause of real sends landing in Gmail's Promotions tab. The AI
  prompt (`Backend/src/providers/ai/prompts/emailCopy.ts`) now carries explicit hard rules
  (first-person only; never "At BeBeyond, we..."; never open with "I came across [Company] while
  researching..." — reference the lead's actual category/industry instead; follow-ups must vary
  their closing phrase instead of reusing stock lines like "close the loop") plus two real
  few-shot examples. The static fallback templates (`Backend/src/modules/emailComposer/fallbackTemplates.ts`,
  used when the AI call fails) carry the same rules, so an AI outage can't silently revert a send
  to the old promotional-sounding copy.
- **Sign-off is now a real person, not just the company.** Added `SENDER_PERSON_NAME` env var
  (default `Pulkit`) — the email signature block is the person's name on its own line, then the
  company name, never the company name alone (`Backend/src/modules/emailComposer/emailTemplate.ts`).
  Brevo's "From" display name now reads e.g. "Pulkit from BeBeyond" instead of the bare company
  name (`Backend/src/providers/email/BrevoProvider.ts`).
- **Follow-up/final emails continue the same thread.** Subjects for `followup`/`final` stage
  sends are now deterministically forced to `Re: {the 'new' email's actual subject}` rather than
  left to the AI (or the fallback template) to invent a fresh one each time — added
  `getSentSubjectForStage()` (`Backend/src/db/repositories/sentEmailsLogRepository.ts`), wired
  through `sendingService.ts`'s `composeForLead()` into `composerService.ts`'s override logic.
- **Sending-domain warm-up ramp and send-spread** (confirmed implemented and wired into the Daily
  Scheduler, not just proposed): an optional ramp (`WARMUP_ENABLED`, `WARMUP_START_DATE`,
  `WARMUP_START_LIMIT`, `WARMUP_GROWTH_RATE`, `WARMUP_GROWTH_INTERVAL_DAYS`) that caps the daily
  send limit lower and grows it over time for a domain with no prior sending history
  (`Backend/src/modules/scheduler/warmup.ts`), and a send-spread window
  (`SEND_SPREAD_WINDOW_HOURS`) that randomizes each scheduler-enqueued send's delay across a
  window instead of firing them all back-to-back at `SCHEDULER_CRON` time
  (`Backend/src/modules/scheduler/sendSpread.ts`). Both disabled/no-op by default (`WARMUP_ENABLED=false`,
  `SEND_SPREAD_WINDOW_HOURS=4`), so existing deployment behavior is unchanged unless opted into.

### Deck Generation

- **Replaced the `pptxgenjs` + LibreOffice-headless PPTX→PDF pipeline with a PDF rendered
  directly via `@react-pdf/renderer`** (`Backend/src/modules/deckGeneration/pdf/`) — pure JS, no
  shell-out to a system binary. This removes a real production risk: LibreOffice was not
  actually installed anywhere in the deployment target (`render.yaml` had no `apt-get` step for
  it) before this, so deck generation would have failed outright in production regardless of any
  font-substitution concerns.
- **Brand colors and fonts re-verified directly against a newer reference deck**
  (`Docs/design-reference/pitch-deck-reference.pdf`) using `pdfplumber` to sample real vector and
  character fill colors rather than eyeballing a logo asset — corrected `cream` and `tealPale` to
  their exact values, and identified/added a previously-missing distinct muted teal
  (`tealShape`, `#2793AD`) used for shape fills, separate from the main text teal (`#219EBC`).
- **Static deck copy corrected against the same reference**: the Success Stories client list grew
  from 18 to a verified 23 real client names (5 were previously missing entirely, one was
  misspelled); the "Our Services" and merged Creative Services slides gained subtitle lines that
  exist in the reference but weren't previously captured. Every other section (About Us, founder
  journey, benefit cards, service catalog, comparison table, testimonials) was confirmed
  unchanged/accurate.
- `render.yaml`'s worker `buildCommand` no longer installs LibreOffice/fonts via `apt-get` —
  nothing left to install for a step that's now pure JS.

### Config

- Added `SENDER_PERSON_NAME` (default `Pulkit`) to `Backend/src/config/env.ts`'s schema,
  `Backend/.env.example`, and `render.yaml`'s env var group.
- `Backend/.env.example` was missing `SEND_SPREAD_WINDOW_HOURS` and the five `WARMUP_*` vars
  despite `env.ts` already reading them — added, with the same defaults `env.ts` uses.
