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

/**
 * True for a 429/quota-exhausted response from either supported AI provider. OpenAI's
 * `APIError`/`RateLimitError` and Gemini's `GoogleGenerativeAIFetchError` both expose a numeric
 * `.status` on the thrown error — 429 is unambiguous in both SDKs, so that's checked first. The
 * message-text fallback covers providers/transports that don't preserve `.status` (e.g. an error
 * that's been wrapped/rethrown) but still describe the failure in words.
 */
export function isQuotaOrRateLimitError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (status === 429) return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|too many requests/i.test(message);
}
