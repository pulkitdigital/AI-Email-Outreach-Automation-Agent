import { Router } from 'express';
import type { PitchDeckGenerationStatus } from '@bebeyond/shared';
import {
  getLatestPitchDeckForLead,
  getPitchDeckById,
  type PitchDeckRecord,
} from '../db/repositories/pitchDecksRepository.js';
import { triggerDeckGeneration } from '../modules/deckGeneration/deckGenerationService.js';
import { DeckGenerationPreconditionError } from '../modules/deckGeneration/errors.js';
import { getStorageProvider } from '../storage/index.js';

export const decksRouter = Router();

interface PitchDeckResponse {
  id: string;
  leadId: string;
  categoryId: string | null;
  status: PitchDeckGenerationStatus;
  error: string | null;
  fileUrl: string | null;
  templateVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

function toResponse(deck: PitchDeckRecord): PitchDeckResponse {
  return {
    id: deck.id,
    leadId: deck.leadId,
    categoryId: deck.categoryId,
    status: deck.generationStatus,
    error: deck.generationError,
    fileUrl: deck.fileUrl,
    templateVersion: deck.templateVersion,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
  };
}

/**
 * POST /api/decks/leads/:id/regenerate — manual regeneration on demand (also the automatic
 * post-categorization trigger's own entrypoint — see categorizationService.maybeTriggerDeckGeneration).
 * Requires the lead to already have a primary category.
 */
decksRouter.post('/leads/:id/regenerate', async (req, res) => {
  try {
    const { pitchDeckId } = await triggerDeckGeneration(req.params.id);
    res.status(202).json({ pitchDeckId, status: 'pending' });
  } catch (err) {
    if (err instanceof DeckGenerationPreconditionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(`[decks-route] failed to trigger regeneration for lead ${req.params.id}:`, err);
    res
      .status(500)
      .json({ error: 'Failed to trigger deck regeneration — see server logs for details' });
  }
});

decksRouter.get('/leads/:id', async (req, res) => {
  try {
    const deck = await getLatestPitchDeckForLead(req.params.id);
    if (!deck) {
      res.status(404).json({ error: `No pitch deck found for lead: ${req.params.id}` });
      return;
    }
    res.json(toResponse(deck));
  } catch (err) {
    console.error(`[decks-route] failed to fetch latest deck for lead ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to fetch pitch deck — see server logs for details' });
  }
});

decksRouter.get('/:id', async (req, res) => {
  try {
    const deck = await getPitchDeckById(req.params.id);
    if (!deck) {
      res.status(404).json({ error: `Pitch deck not found: ${req.params.id}` });
      return;
    }
    res.json(toResponse(deck));
  } catch (err) {
    console.error(`[decks-route] failed to fetch deck ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to fetch pitch deck — see server logs for details' });
  }
});

/**
 * Provider-agnostic download: works whether the file lives in R2 or local disk (see
 * storage/index.ts). `?format=pdf` picks pdfFileKey, otherwise fileKey — same two-column shape
 * pitch_decks has always had (see pitchDecksRepository.ts).
 *
 * Since the react-pdf pipeline (deckGenerationService.ts) now writes the SAME generated PDF under
 * both fileKey and pdfFileKey (there's only one artifact anymore — no separate .pptx), this route
 * no longer assumes the non-pdf branch means "pptx": the actual Content-Type/filename extension
 * is derived from the resolved fileKey's own extension, not from the `wantsPdf` flag. That keeps
 * both the default link and `?format=pdf` correct for decks generated under the new pipeline
 * (both branches resolve to the same .pdf key) AND for any deck generated before this migration
 * (fileKey still genuinely ends in .pptx there) — no data migration needed for either case.
 */
decksRouter.get('/:id/download', async (req, res) => {
  try {
    const deck = await getPitchDeckById(req.params.id);
    if (!deck) {
      res.status(404).json({ error: `Pitch deck not found: ${req.params.id}` });
      return;
    }

    const wantsPdf = req.query.format === 'pdf';
    const fileKey = wantsPdf ? deck.pdfFileKey : deck.fileKey;
    if (!fileKey) {
      res.status(404).json({
        error: `No downloadable ${wantsPdf ? 'PDF' : 'PPTX'} for pitch deck: ${req.params.id}`,
      });
      return;
    }

    const storage = getStorageProvider();
    const buffer = await storage.getObject(fileKey);

    const isPdf = fileKey.toLowerCase().endsWith('.pdf');
    res.setHeader(
      'Content-Type',
      isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pitch-deck-${deck.id}.${isPdf ? 'pdf' : 'pptx'}"`,
    );
    res.send(buffer);
  } catch (err) {
    console.error(`[decks-route] failed to download deck ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to download pitch deck — see server logs for details' });
  }
});
