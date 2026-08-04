import { env } from '../../config/env.js';
import { getCategoryById } from '../../db/repositories/categoriesRepository.js';
import {
  createPitchDeck,
  getPitchDeckById,
  updatePitchDeckStatus,
} from '../../db/repositories/pitchDecksRepository.js';
import { getLeadById, updateLeadStatus } from '../../db/repositories/leadsRepository.js';
import { enqueueDeckGenerationJob } from '../../queue/queues.js';
import { getStorageProvider } from '../../storage/index.js';
import { buildDeckForLead, DECK_TEMPLATE_VERSION } from './deckBuilder.js';
import { DeckGenerationPreconditionError } from './errors.js';
<<<<<<< HEAD
import { convertPptxToPdf } from './pptxToPdf.js';
=======
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7

const GENERATED_BY = 'pptxgenjs-template';
const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
<<<<<<< HEAD
const PDF_CONTENT_TYPE = 'application/pdf';
=======
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7

function buildStorageKey(leadId: string, pitchDeckId: string): string {
  return `pitch-decks/${leadId}/${pitchDeckId}.pptx`;
}

<<<<<<< HEAD
function buildPdfStorageKey(leadId: string, pitchDeckId: string): string {
  return `pitch-decks/${leadId}/${pitchDeckId}.pdf`;
}

function resolveFileUrl(
  fileKey: string,
  pitchDeckId: string,
  variant: 'pptx' | 'pdf' = 'pptx',
): string {
=======
function resolveFileUrl(fileKey: string, pitchDeckId: string): string {
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${fileKey}`;
  }
  // No public bucket domain configured (local dev, or a private R2 bucket) — fall back to our
  // own provider-agnostic download route (see routes/decks.ts), which works for both storage
  // backends. Relative on purpose; the caller/dashboard prefixes it with the backend origin.
<<<<<<< HEAD
  // Both variants share one route (keyed by pitchDeckId only) — ?format=pdf picks the .pdf
  // rendering instead of the default .pptx, since a single pitch_decks row now has both.
  return variant === 'pdf'
    ? `/api/decks/${pitchDeckId}/download?format=pdf`
    : `/api/decks/${pitchDeckId}/download`;
=======
  return `/api/decks/${pitchDeckId}/download`;
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
}

/**
 * Single entrypoint for kicking off deck generation, used by both the automatic
 * post-categorization trigger and the manual regenerate API — one place decides "is this lead
 * eligible" and creates the pitch_decks row before enqueueing, so the worker always has an
 * existing row to update through pending -> generating -> ready/failed, even across retries.
 */
export async function triggerDeckGeneration(leadId: string): Promise<{ pitchDeckId: string }> {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error(`Cannot generate deck: lead not found (${leadId})`);
  }
  if (!lead.categoryId) {
    throw new DeckGenerationPreconditionError(
      `Cannot generate deck: lead ${leadId} has no primary category yet`,
    );
  }

  const pitchDeck = await createPitchDeck({
    leadId,
    categoryId: lead.categoryId,
    templateVersion: DECK_TEMPLATE_VERSION,
  });

  await enqueueDeckGenerationJob({ leadId, pitchDeckId: pitchDeck.id });

  return { pitchDeckId: pitchDeck.id };
}

/**
 * Does the actual work for one pitch_decks row: build the pptx, upload it, record the result.
 * Never lets a failure here escape into whatever triggered it — it's always invoked from the
 * deck-generation worker (a separate BullMQ queue/process from ingestion and categorization),
 * so a failure can only fail *this* job, never the pipeline that enqueued it. On error, the
 * pitch_decks row is marked 'failed' with the reason and the error is rethrown so the worker's
 * attempt-aware retry logic (see workers/deckGenerationWorker.ts) can decide whether to retry.
 */
export async function generateDeckForLead(leadId: string, pitchDeckId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error(`Cannot generate deck: lead not found (${leadId})`);
  }
  if (!lead.categoryId) {
    throw new DeckGenerationPreconditionError(
      `Cannot generate deck: lead ${leadId} has no primary category yet`,
    );
  }

  const pitchDeck = await getPitchDeckById(pitchDeckId);
  if (!pitchDeck) {
    throw new Error(`Cannot generate deck: pitch deck record not found (${pitchDeckId})`);
  }

  try {
    await updatePitchDeckStatus(pitchDeckId, { status: 'generating', generationError: null });

    const category = await getCategoryById(lead.categoryId);
    const buffer = await buildDeckForLead({
      companyName: lead.companyName?.trim() || 'Your Business',
      primaryCategorySlug: category?.slug ?? null,
    });

    const storage = getStorageProvider();
    const fileKey = buildStorageKey(leadId, pitchDeckId);
    await storage.putObject(fileKey, buffer, PPTX_CONTENT_TYPE);

<<<<<<< HEAD
    // Converts the just-built .pptx to .pdf via LibreOffice headless (pptxToPdf.ts) right here,
    // at generation time rather than at send time in sendingService.ts — deliberately, for three
    // reasons: (1) conversion runs once per deck, not once per send attempt (a 'new'-stage send
    // that needs a retry would otherwise reconvert every time); (2) it keeps the sending worker
    // free of a LibreOffice dependency entirely — its job stays "compose + call the email
    // provider," not "also shell out to a document converter"; (3) a conversion failure surfaces
    // immediately as a failed deck (generation_status = 'failed', same as a pptx-build failure),
    // symmetric with how this function already treats build/upload failures, instead of becoming
    // a brand-new failure mode on the send path. A deck isn't 'ready' until both files exist.
    const pdfBuffer = await convertPptxToPdf(buffer);
    const pdfFileKey = buildPdfStorageKey(leadId, pitchDeckId);
    await storage.putObject(pdfFileKey, pdfBuffer, PDF_CONTENT_TYPE);

=======
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
    await updatePitchDeckStatus(pitchDeckId, {
      status: 'ready',
      generationError: null,
      generatedBy: GENERATED_BY,
      fileKey,
      fileUrl: resolveFileUrl(fileKey, pitchDeckId),
<<<<<<< HEAD
      pdfFileKey,
      pdfFileUrl: resolveFileUrl(pdfFileKey, pitchDeckId, 'pdf'),
=======
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
    });

    // Non-regressive, same philosophy as categorization: only advance a lead that's actually
    // waiting on its deck. A lead already further along (in_sequence, ...) keeps its status —
    // regenerating its deck (e.g. after a category correction) shouldn't rewind its pipeline stage.
    if (lead.status === 'categorized') {
      await updateLeadStatus(leadId, 'deck_generated');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updatePitchDeckStatus(pitchDeckId, { status: 'failed', generationError: message });
    throw err;
  }
}

/**
 * Called by the deck-generation worker once BullMQ retries are exhausted (or immediately on a
 * non-retryable DeckGenerationPreconditionError) — flags the lead for manual regeneration via
 * the (future) dashboard, per the documented fallback. The pitch_decks row already carries
 * generation_status='failed' + generation_error from generateDeckForLead's own catch block;
 * this only decides whether the LEAD's status should also reflect it.
 */
export async function markDeckGenerationFailed(leadId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) return;

  if (lead.status === 'categorized') {
    await updateLeadStatus(leadId, 'needs_review', 'deck_generation_failed');
  }
}
