import { describe, expect, it } from 'vitest';
import { isQuotaOrRateLimitError } from '../errors.js';

describe('isQuotaOrRateLimitError', () => {
  it('is true for an error with status 429 (OpenAI RateLimitError / Gemini GoogleGenerativeAIFetchError shape)', () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 });
    expect(isQuotaOrRateLimitError(err)).toBe(true);
  });

  it('is true for a message mentioning quota even without a status', () => {
    expect(isQuotaOrRateLimitError(new Error('You exceeded your current quota'))).toBe(true);
  });

  it('is true for a message mentioning rate limit', () => {
    expect(isQuotaOrRateLimitError(new Error('rate limit exceeded, please retry later'))).toBe(
      true,
    );
  });

  it('is false for an unrelated error', () => {
    expect(isQuotaOrRateLimitError(new Error('malformed JSON'))).toBe(false);
  });

  it('is false for a non-429 status', () => {
    const err = Object.assign(new Error('Bad Request'), { status: 400 });
    expect(isQuotaOrRateLimitError(err)).toBe(false);
  });

  it('is false for a non-Error thrown value with no matching text', () => {
    expect(isQuotaOrRateLimitError('boom')).toBe(false);
  });
});
