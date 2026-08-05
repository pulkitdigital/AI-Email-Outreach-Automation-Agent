# Status — what's actually done vs. still pending

This file exists because things get discussed, prompted for, or partially built across sessions
without always landing. Everything below was checked directly against the current code (not
assumed from prior conversation) as of **2026-08-05**. If you're picking this project up and
unsure whether something is real, check here first — and re-verify against the code before
relying on this list too, since it will itself go stale the moment something changes.

## Confirmed implemented (verified against code)

- Email tone rewrite (first-person, no agency-pitch boilerplate), person-first sign-off
  (`SENDER_PERSON_NAME`), and deterministic `Re:` subject continuation for follow-up/final
  emails — see `CHANGELOG.md` and `Docs/ARCHITECTURE.md` § 4.
- Deck generation fully re-platformed onto `@react-pdf/renderer` — `deckGenerationService.ts`
  calls only `pdf/generateDeckPdf.ts`; the old `pptxgenjs`/LibreOffice call sites are not on the
  live path. See "Not yet done" below for what's left over from the old pipeline.
- Sending-domain warm-up ramp (`WARMUP_*` env vars, `modules/scheduler/warmup.ts`) and send-spread
  window (`SEND_SPREAD_WINDOW_HOURS`, `modules/scheduler/sendSpread.ts`) — both wired into
  `dailySchedulerService.ts`, both disabled/inert by default.
- `render.yaml` no longer installs LibreOffice — confirmed no `apt-get` step remains in either
  service's `buildCommand`.

## Not yet done — confirmed absent, don't assume otherwise

- **No dedicated outbound deliverability setup doc.** There is no `Docs/deliverability-setup.md`
  (or any similarly-named file) with SPF/DKIM/DMARC setup instructions for the sending domain.
  `Docs/BREVO_INBOUND_SETUP.md` only covers the *inbound* reply-webhook subdomain and explicitly
  says that one doesn't need SPF/DKIM/DMARC. `Docs/ARCHITECTURE.md` § 5 flags inline that
  outbound SPF/DKIM/DMARC verification in Brevo "was not confirmed at build time" — that's still
  true; nothing has since verified or documented it. If real (non-test) sending volume increases
  and Promotions-tab/spam placement is still a concern, this is the next real gap, not just the
  tone/signature work already done.
- **No preview script.** There is no `Backend/scripts/previewSequence.ts` or any script for
  generating a sample deck/email sequence without actually sending/queuing something real —
  checked, does not exist anywhere in `Backend/`. The closest existing thing is
  `sendingService.ts`'s `previewSequenceEmail()` (an in-app function backing the dashboard's
  "edit before sending" feature, not a standalone CLI/script), and generating a one-off sample
  deck currently means writing a throwaway script against `buildDeckPdfForLead()` by hand.
- **Old pptxgenjs/LibreOffice deck code is still in the repo, unwired.**
  `Backend/src/modules/deckGeneration/{deckBuilder.ts,pptxToPdf.ts,slides/*.ts,pptxgenLoader.ts}`
  are not deleted — deliberately left in place rather than bundled into the rendering-engine
  swap (see `Docs/ARCHITECTURE.md` § 3's closing note) — but nothing calls them anymore. Treat
  this as a pending cleanup decision, not active code.
- **`pitch_decks.file_key`/`pdf_file_key` are now redundant, not merged.** Both column pairs are
  written with the same value on every generation (see `Docs/DATABASE_SCHEMA.md`'s `pitch_decks`
  note) since there's only one artifact now. No migration has been written to collapse them into
  one pair — left as a deliberate future cleanup.
- **GmailProvider is still a stub.** `Backend/src/providers/email/GmailProvider.ts` throws
  `GmailNotImplementedError` on every method — unchanged, `EMAIL_PROVIDER=brevo` is the only
  working option. `assertEmailProviderReady()` still fails fast at boot if `EMAIL_PROVIDER=gmail`
  is set.
- **WhatsApp channel infrastructure exists but isn't wired into the Daily Scheduler.**
  `MetaCloudWhatsAppProvider` and the click-to-WhatsApp email CTA (`WHATSAPP_CTA_ENABLED`) exist,
  but sending stays manually triggered — confirmed unchanged, matches `.env.example`'s own note
  on `WHATSAPP_PROVIDER`.

## How this file gets stale

Anything above can flip from "not done" to "done" in a later session without this file being
updated. Before trusting an entry here for anything consequential (a deploy decision, telling a
user something works), re-grep the actual code path named above rather than trusting this
summary at face value.
