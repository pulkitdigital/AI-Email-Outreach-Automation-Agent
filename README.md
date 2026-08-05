# BeBeyond Digital Solutions — AI Email Outreach Automation Agent

Automated lead ingestion, categorization, personalized pitch-deck generation, and time-based
email outreach sequencing for BeBeyond Digital Solutions.

## Status

- **Phase 0 — Foundation**: monorepo, schema, docs. ✅
- **Phase 1 — Ingestion**: ZIP/PDF/CSV/XLSX upload + Google Drive, dedup/merge, review queue. ✅
- **Phase 2 — Categorization**: hybrid rule engine + AI fallback, primary/secondary categories. ✅
- **Phase 3 — Deck Generation**: personalized PDF per lead, rendered directly via
  `@react-pdf/renderer` (re-platformed off an earlier `pptxgenjs` + LibreOffice-headless
  pipeline — pure JS now, no system binary/deployment risk), R2 storage. Brand colors/fonts and
  static copy re-verified against a newer reference deck. ✅
- **Phase 4 — Email Composer & Sending Engine**: AI-generated copy w/ static fallback, Brevo
  sending (test/sandbox mode), race-safe dedup, unsubscribe links. Manual trigger only — no
  scheduler yet. Tone rewritten for deliverability (first-person, person-first sign-off via
  `SENDER_PERSON_NAME`, no generic agency-pitch boilerplate) and follow-up/final subjects now
  deterministically continue the original thread (`Re: ...`) instead of reading as a new email. ✅
- **Phase 5 — Full Automation**: `new`-stage emails attach the lead's pitch deck; Brevo Inbound
  Parse + transactional webhooks (reply/bounce/unsubscribe) wired up behind the `EmailProvider`
  interface; fully automated Daily Scheduler (BullMQ repeatable job) applying the
  `DAILY_EMAIL_LIMIT` cap with followup/final priority; `daily_summary` audit table; mid-flight
  re-check closing the reply-during-send race; scheduler-enqueued sends are spread across a
  randomized window (`SEND_SPREAD_WINDOW_HOURS`) instead of firing back-to-back, and an optional
  sending-domain warm-up ramp (`WARMUP_ENABLED`) can cap the daily limit lower and grow it over
  time for a domain with no prior sending history. Zero manual intervention day-to-day once
  deployed — see `Docs/ARCHITECTURE.md` § 5-6. **Live inbound testing is pending DNS setup** —
  see `Docs/BREVO_INBOUND_SETUP.md`. ✅
- **Phase 6 — Dashboard**: Next.js + Tailwind + shadcn/ui + TanStack Query/Table. System Status
  (active providers + every failure surface in one place), Ingestion (upload/Drive + needs-review
  queue with inline edit/confirm), Leads (filterable table + per-lead detail with sequence
  tracking), Sent Email Log, Daily Summary (trend charts), Replies. Added the handful of
  general-purpose list/detail backend endpoints the dashboard needed that didn't already exist
  (`/api/leads`, `/api/sending/logs`, `/api/scheduler/daily-summary`, `/api/replies`,
  `/api/system/status`) — see `Docs/ARCHITECTURE.md` § 7. ✅
- **Phase 7+**: not yet scoped.

See `Docs/ARCHITECTURE.md` for the seven layers (six backend + dashboard) and
`Docs/DATABASE_SCHEMA.md` for the full schema.

## Structure

```
Backend/    Node.js + Express (TypeScript) API and BullMQ workers
Frontend/   Next.js (App Router) dashboard
shared/     Shared TypeScript types (provider interfaces, status enums) used by both
Docs/       ARCHITECTURE.md, DATABASE_SCHEMA.md, BREVO_INBOUND_SETUP.md, STATUS.md,
            design-reference/ (source pitch-deck PDF the current deck template's copy/brand
            values were verified against — see Docs/ARCHITECTURE.md § 3)
```

Split-deployment note: `Frontend` (Vercel) and `Backend` (Render) both depend on `shared`, which
lives at the repo root, not inside either app — see `vercel.json` / `render.yaml` at the repo
root for how each platform's build is pointed at the monorepo root rather than the app subfolder.

## Local setup

Env vars are split per app (each deploys independently — see the split-deployment note above).
Local dev uses cloud-hosted Postgres and Redis by default — the same providers production
(Render) uses — not local containers, so local dev and production stay identical:

```bash
cp Backend/.env.example Backend/.env             # fill in below, generate UNSUBSCRIBE_SECRET (see the file)
cp Frontend/.env.local.example Frontend/.env.local  # points at the Backend API URL
npm install
npm run build:shared
npm run db:migrate
npm run dev:backend     # http://localhost:4000/health
npm run dev:worker      # ingestion + categorization + deck-generation + sending workers
npm run dev:dashboard   # http://localhost:3000
```

In `Backend/.env`, set:

- `DATABASE_URL` — a cloud Postgres connection string (e.g. [Neon](https://neon.tech), free tier
  works fine for dev). Include `?sslmode=require` if your provider requires it (most do) — the
  `pg` driver parses this automatically, no extra config needed.
- `REDIS_URL` — an [Upstash](https://upstash.com) Redis connection string, using the `rediss://`
  scheme (not `redis://`) for TLS. `ioredis` auto-detects TLS from the `rediss://` scheme, no
  extra config needed.
- `AI_PROVIDER` — `gemini` (default) or `openai`; only the matching `*_API_KEY` is required.
- `SENDER_PERSON_NAME` — the real person outreach emails read as being from (default `Pulkit`).
  Used as the email sign-off and folded into Brevo's "From" display name — see
  `Docs/ARCHITECTURE.md` § 4 for why this matters for deliverability.
- `SEND_SPREAD_WINDOW_HOURS` / `WARMUP_*` — optional scheduler tuning (send-spread window,
  sending-domain warm-up ramp); sensible defaults are set, only touch these if you need to change
  the ramp behavior — see `Backend/.env.example`'s comments and `Docs/ARCHITECTURE.md` § 6.

**Docker is optional**, not required — if you'd rather run Postgres/Redis locally instead of
using cloud services even for dev, `docker compose up -d` still works (see the comment at the
top of `docker-compose.yml`); just point `DATABASE_URL`/`REDIS_URL` in `Backend/.env` at
`localhost` instead.

## Docs

- [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md) — the six backend processing layers, the dashboard
  (§ 7), and the email/AI provider abstractions
- [Docs/DATABASE_SCHEMA.md](Docs/DATABASE_SCHEMA.md) — full Postgres schema, dedup strategy,
  status enums
- [Docs/BREVO_INBOUND_SETUP.md](Docs/BREVO_INBOUND_SETUP.md) — DNS + Brevo dashboard setup for
  live reply/bounce webhooks
- [Docs/STATUS.md](Docs/STATUS.md) — what's actually implemented vs. only discussed/proposed, as
  of the last investigation pass; check here before assuming a feature is done
- [CHANGELOG.md](CHANGELOG.md) — dated summary of notable changes
