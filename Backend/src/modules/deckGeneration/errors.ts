/**
 * Thrown when a lead doesn't meet the precondition for deck generation (no primary category
 * yet). Retrying can't fix this — the worker treats it as non-retryable, same pattern as
 * AIConfigError in the categorization worker.
 */
export class DeckGenerationPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeckGenerationPreconditionError';
  }
}

/**
 * Thrown by pptxToPdf.ts when the .pptx -> .pdf conversion step fails for any reason
 * (LibreOffice not installed/not found, the soffice process timing out, a non-zero exit code,
 * or a missing/empty output file). Not special-cased as non-retryable the way
 * DeckGenerationPreconditionError/AIConfigError are — deckGenerationWorker.ts's generic
 * attempt-aware retry already covers this fine: a permanent cause (binary missing) just
 * exhausts its attempts quickly and lands on the same markDeckGenerationFailed() outcome,
 * while a genuinely transient one (e.g. a timeout under load) gets a real chance to succeed on
 * retry. See deckGenerationService.ts's generateDeckForLead.
 */
export class DeckPdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeckPdfConversionError';
  }
}
