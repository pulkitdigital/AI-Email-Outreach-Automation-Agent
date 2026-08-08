-- Generic key-value settings table, first used to make the Daily Scheduler's cron pattern
-- editable from the dashboard instead of requiring a redeploy to change SCHEDULER_CRON. See
-- routes/settings.ts (GET/PUT /api/settings/scheduler-cron) and queue/startWorkers.ts, which now
-- reads scheduler_cron from here first, falling back to env.SCHEDULER_CRON only when the row is
-- missing (first-run case, or before anyone has saved a value via the UI).

CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seeded with the codebase's own default cron pattern (config/env.ts's SCHEDULER_CRON schema
-- default) — the real per-deployment .env value isn't visible to this migration. Purely a
-- first-run fallback: overwritten the moment anyone saves a time via the Settings page.
INSERT INTO app_settings (key, value) VALUES ('scheduler_cron', '0 9 * * *');
