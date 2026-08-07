-- Already-contacted visibility for ingestion duplicate matches.
--
-- When an uploaded row matches an existing lead by email_normalized, this surfaces whether that
-- lead has already been sent at least one email — a sub-classification of the "already exists"
-- case (total_leads_merged / the unchanged-duplicate case), not a separate bucket: a row can be
-- both "unchanged" AND "already contacted" at the same time. See leadsRepository.upsertLead and
-- modules/ingestion/leadWriter.ts.
ALTER TABLE ingestion_jobs ADD COLUMN total_leads_already_contacted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN already_contacted_items JSONB NOT NULL DEFAULT '[]'::jsonb;
