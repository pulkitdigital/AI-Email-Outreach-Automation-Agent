/**
 * Thrown when a required AI provider credential/config is missing. Distinct from a transient
 * API error: retrying a missing API key wastes the whole BullMQ backoff window for nothing, so
 * the categorization worker checks for this specifically and skips straight to "needs review"
 * instead of burning retry attempts on a deterministic misconfiguration.
 */
export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}
