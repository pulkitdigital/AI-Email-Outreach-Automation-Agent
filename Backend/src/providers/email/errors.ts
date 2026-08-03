/** Thrown when a required email provider credential is missing — same non-retryable pattern as AIConfigError. */
export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigError';
  }
}

/**
 * Wraps a classified provider API failure. `retryable` distinguishes transient problems (rate
 * limits, 5xx/downtime) — worth retrying via BullMQ backoff — from permanent ones (invalid
 * recipient, bad request, auth failure) that will never succeed no matter how many times they're
 * retried, and should be logged as a final failure immediately instead of burning the retry
 * window.
 */
export class EmailApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
    public readonly retryable: boolean,
    public override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'EmailApiError';
  }
}

/** 429 (rate limit) and 5xx (provider downtime) are worth retrying; everything else (4xx like bad request/invalid recipient/auth) is not. */
export function isRetryableStatusCode(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return true; // network-level failure (no HTTP response at all) — assume transient
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}
