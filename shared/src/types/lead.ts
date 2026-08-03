/**
 * Mirrors the CHECK-constrained TEXT columns in docs/DATABASE_SCHEMA.md.
 * Keep these unions in sync with the schema by hand — there is no codegen yet.
 */

export type ServiceGroup =
  'digital_marketing' | 'web_app_solutions' | 'creative_services' | 'marketplace_commerce';

export type LeadStatus =
  | 'new'
  | 'needs_review' // Phase 1: ingested but extraction confidence too low to trust — never auto-promoted
  | 'categorized'
  | 'deck_generated'
  | 'in_sequence'
  | 'completed'
  | 'replied'
  | 'bounced'
  | 'do_not_contact';

/**
 * Why a lead landed in status 'needs_review'. Phase 1 producers: pdfParser (heuristic table
 * extraction and AI-stub extraction are both inherently uncertain) and columnMapper (ambiguous
 * non-critical column mapping forced a best-guess). Phase 2 producers: categorizationService
 * (AI categorization call failed after exhausting retries, or succeeded but below the trust
 * threshold). Phase 3 producer: deckGenerationService (deck build/upload failed after
 * exhausting retries). Phase 4 producer: sendingService (email send failed after exhausting
 * retries — the sequence is paused, not silently advanced). Kept open-ended (string) at the DB
 * level (leads.review_reason TEXT) but enumerated here for known producers.
 */
export type LeadReviewReason =
  | 'pdf_heuristic_table_extraction'
  | 'pdf_ai_extraction_pending' // AI extraction interface exists but is stubbed until a later phase
  | 'pdf_scanned_needs_ocr'
  | 'ambiguous_column_mapping'
  | 'ai_categorization_failed' // AI call errored/timed out after exhausting BullMQ retries
  | 'ai_categorization_low_confidence' // AI responded but below the trust threshold — not guessed
  | 'deck_generation_failed' // pptx build or storage upload failed after exhausting BullMQ retries
  | 'email_send_failed'; // provider send failed after exhausting BullMQ retries — sequence paused

export type CategorizationMethod = 'rule_based' | 'ai' | 'manual';

export type IngestionSourceType = 'zip' | 'pdf' | 'csv' | 'xlsx' | 'gdrive';

export type IngestionJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

export type PitchDeckGenerationStatus = 'pending' | 'generating' | 'ready' | 'failed';

export type SequenceStage =
  | 'new'
  | 'followup'
  | 'final'
  | 'completed'
  | 'stopped_reply'
  | 'stopped_bounce'
  | 'stopped_unsubscribe'
  | 'stopped_manual';

/**
 * 'cancelled' (Phase 5): the send was claimed and composed, but the lead became ineligible
 * (replied/bounced/opted-out/otherwise stopped) during composition, before the provider call was
 * made — see sendingService.ts's mid-flight re-check. Distinct from 'failed' (provider rejected
 * or errored) — a cancelled send was never attempted.
 */
export type SentEmailStatus =
  'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opened' | 'cancelled';
