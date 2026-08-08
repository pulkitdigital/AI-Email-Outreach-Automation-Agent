-- Sender identity (name, designation, company) used in the outbound email signature, the AI
-- composer's self-identification, and the Brevo "From" display name — editable from the
-- dashboard's Settings page instead of requiring a .env change + backend restart. Same
-- DB-first-with-env-fallback pattern as scheduler_cron (see 0011_scheduler_settings.sql),
-- reusing the same app_settings table.
--
-- ON CONFLICT DO NOTHING (rather than 0011's plain INSERT) since app_settings already exists and
-- may already hold unrelated rows — this keeps re-running migrations safe without clobbering a
-- value someone already saved via the Settings page.
INSERT INTO app_settings (key, value) VALUES
    ('sender_person_name', 'Pulkit'),
    ('sender_designation', 'Founder'),
    ('sender_company_name', 'BeBeyond Digital Solutions')
ON CONFLICT (key) DO NOTHING;
