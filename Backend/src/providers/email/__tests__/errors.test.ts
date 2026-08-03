import { describe, expect, it } from 'vitest';
import { isRetryableStatusCode } from '../errors.js';

describe('isRetryableStatusCode', () => {
  it('treats 429 (rate limit) as retryable', () => {
    expect(isRetryableStatusCode(429)).toBe(true);
  });

  it('treats every 5xx as retryable', () => {
    expect(isRetryableStatusCode(500)).toBe(true);
    expect(isRetryableStatusCode(502)).toBe(true);
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(599)).toBe(true);
  });

  it('treats a missing status code (network-level failure) as retryable', () => {
    expect(isRetryableStatusCode(undefined)).toBe(true);
  });

  it('treats 400/401/403/404 (bad request, auth, invalid recipient) as permanent, not retryable', () => {
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableStatusCode(401)).toBe(false);
    expect(isRetryableStatusCode(403)).toBe(false);
    expect(isRetryableStatusCode(404)).toBe(false);
  });

  it('does not treat 600+ as a valid 5xx range', () => {
    expect(isRetryableStatusCode(600)).toBe(false);
  });
});
