/**
 * Thrown when a lead doesn't meet the precondition for sending a given stage (no category yet,
 * wrong status for that stage, no sequence exists for a non-'new' stage, or a detected
 * cross-lead email collision). Retrying can't fix any of these — the worker treats this as
 * non-retryable, same pattern as AIConfigError/DeckGenerationPreconditionError.
 */
export class SendPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendPreconditionError';
  }
}
