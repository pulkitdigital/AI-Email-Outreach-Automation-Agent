import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

/**
 * `dotenv/config`'s bare import resolves `.env` relative to `process.cwd()` — which doesn't
 * reliably match this package's own root: npm workspaces runs `npm run dev -w Backend` (or the
 * root `dev:backend` alias for it) with CWD set to `Backend/` itself, but other invocations
 * (an IDE run config, a container's WORKDIR) could differ. Resolve the path explicitly from
 * this file's own location instead, so `Backend/.env` is always found regardless of invocation
 * CWD. Split-deployment note: this is intentionally `Backend/.env`, not a repo-root `.env` — the
 * Frontend has its own separate `.env.local` (Next.js auto-loads that from its own project
 * root), since Frontend (Vercel) and Backend (Render) deploy and configure independently.
 */
loadDotenv({ path: path.resolve(fileURLToPath(import.meta.url), '../../../.env') });

/**
 * Fail fast on a missing/invalid env var at startup rather than failing silently deep inside
 * a queue worker later. Every consumer imports `env` from here instead of touching
 * `process.env` directly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Categorization (Phase 2) — below this, an AI-provided category is not trusted (needs_review
  // instead of guessed). Tunable without touching rule weights/thresholds in ruleEngine.ts.
  AI_CATEGORIZATION_MIN_CONFIDENCE: z.coerce.number().default(0.5),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  // Local dev default so ingestion can be exercised with no cloud credentials configured.
  // Set to 'r2' in production (Railway). See Backend/src/storage/index.ts.
  STORAGE_PROVIDER: z.enum(['local', 'r2']).default('local'),

  // Google Drive ingestion — service account auth (confirmed with the user over OAuth2/API-key
  // alternatives; see Docs/ARCHITECTURE.md § 1 Ingestion Layer). Each source folder must be
  // shared with this service account's email address.
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: z.string().optional(),

  MAX_UPLOAD_FILE_SIZE_MB: z.coerce.number().default(200),
  ZIP_MAX_RECURSION_DEPTH: z.coerce.number().default(5),

  EMAIL_PROVIDER: z.enum(['brevo', 'gmail']).default('brevo'),

  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().optional(),
  BREVO_SENDER_NAME: z.string().optional(),
  BREVO_INBOUND_WEBHOOK_SECRET: z.string().optional(),
  BREVO_INBOUND_WEBHOOK_URL: z.string().optional(),

  // Phase 4 — this backend's own internet-facing URL, used to build links embedded in
  // outbound emails (unsubscribe). Must be reachable by real recipients, not just localhost,
  // once real sending starts.
  PUBLIC_APP_URL: z.string().default('http://localhost:4000'),
  // Signs/verifies stateless unsubscribe tokens (HMAC) — see modules/emailComposer/unsubscribeToken.ts.
  // Required at first actual use, not at boot, so local dev without it doesn't break unrelated work.
  UNSUBSCRIBE_SECRET: z.string().min(16).optional(),

  // BullMQ worker-level rate limit on the email-send queue — conservative default for Brevo's
  // free tier (no explicit per-second cap advertised); raise once the plan/limits are confirmed.
  EMAIL_SEND_RATE_LIMIT_MAX: z.coerce.number().default(5),
  EMAIL_SEND_RATE_LIMIT_DURATION_MS: z.coerce.number().default(1000),

  // TODO: fill in once Google Workspace access on bebeyond.digital is resolved
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_SENDER_EMAIL: z.string().optional(),
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GMAIL_PUBSUB_TOPIC: z.string().optional(),
  GMAIL_PUBSUB_SUBSCRIPTION: z.string().optional(),

  DAILY_EMAIL_LIMIT: z.coerce.number().default(300),
  SCHEDULER_TIMEZONE: z.string().default('Asia/Kolkata'),
  // Cron expression (evaluated in SCHEDULER_TIMEZONE) for the once-daily automated run — see
  // modules/scheduler/dailySchedulerService.ts and queue/workers/schedulerWorker.ts. Default:
  // 09:00 daily, a reasonable business-hours send time for outreach.
  SCHEDULER_CRON: z.string().default('0 9 * * *'),

  // Shared secrets for verifying inbound Brevo webhook requests are genuine — see
  // Docs/BREVO_INBOUND_SETUP.md and routes/webhooks.ts. Distinct from BREVO_INBOUND_WEBHOOK_SECRET
  // (Phase 0) which covers only the Inbound Parse (reply) webhook; this covers the separate
  // transactional-events webhook (bounces/unsubscribes).
  BREVO_EVENTS_WEBHOOK_SECRET: z.string().optional(),

  // Comma-separated list of origins the Frontend dashboard is allowed to call this API from —
  // see index.ts's cors() setup. Local dev default covers `npm run dev:dashboard`'s port; add
  // the Vercel production URL here once Frontend is deployed (see .env.example's comment).
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration — see logged field errors above');
}

export const env = parsed.data;
