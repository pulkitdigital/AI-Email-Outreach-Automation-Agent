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
