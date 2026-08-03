/** Thrown when a lead isn't in 'needs_review' when confirm is attempted — same non-retryable precondition pattern as SendPreconditionError/DeckGenerationPreconditionError. */
export class LeadReviewPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadReviewPreconditionError';
  }
}
