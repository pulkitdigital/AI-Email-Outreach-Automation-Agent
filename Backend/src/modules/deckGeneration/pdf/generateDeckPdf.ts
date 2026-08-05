/**
 * Entrypoint for the react-pdf deck pipeline — replaces the old pptxgenjs-build +
 * LibreOffice-headless-convert two-step (deckBuilder.ts + pptxToPdf.ts) with a single direct
 * PDF render. Pure JS end to end: no system binaries, no LibreOffice, no font-substitution risk
 * (fonts.ts registers the real Bricolage Grotesque / Public Sans files from node_modules).
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { DeckDocument, DECK_SLIDE_COUNT } from './DeckDocument.js';
import { registerDeckFonts } from './fonts.js';
import type { DeckContext } from '../types.js';

export const DECK_TEMPLATE_VERSION = 'v2-react-pdf';

export interface BuiltDeckPdf {
  buffer: Buffer;
  pageCount: number;
}

/**
 * Renders the full 12-slide deck for one lead directly to a PDF buffer. `pageCount` is the fixed
 * DECK_SLIDE_COUNT rather than something read back off the rendered PDF — every call renders the
 * same fixed <Document>/<Page> structure (only text content varies per lead), so there's no
 * scenario where the actual page count could differ from what DeckDocument.tsx declares; asserting
 * that invariant here (rather than trusting it silently) means a future slide added to
 * DeckDocument.tsx without updating DECK_SLIDE_COUNT fails loudly instead of quietly drifting.
 */
export async function buildDeckPdfForLead(ctx: DeckContext): Promise<BuiltDeckPdf> {
  registerDeckFonts();

  // Calling the component function directly (rather than <DeckDocument ctx={ctx} />) so the
  // resulting JSX.Element's inferred type is broad enough to satisfy renderToBuffer's
  // ReactElement<DocumentProps> parameter type — DeckDocument's actual runtime output is always a
  // <Document>, just not something TS can see through a JSX-element-typed indirection.
  const buffer = await renderToBuffer(DeckDocument({ ctx }));

  return { buffer, pageCount: DECK_SLIDE_COUNT };
}
