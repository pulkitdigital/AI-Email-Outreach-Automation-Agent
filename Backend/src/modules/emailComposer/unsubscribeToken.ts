import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/** Thrown when UNSUBSCRIBE_SECRET isn't configured — checked at point of use, not at boot, so local dev without it doesn't break unrelated work. */
export class UnsubscribeConfigError extends Error {
  constructor() {
    super('UNSUBSCRIBE_SECRET is not set — required to generate or verify unsubscribe links');
    this.name = 'UnsubscribeConfigError';
  }
}

function getSecret(): string {
  if (!env.UNSUBSCRIBE_SECRET) {
    throw new UnsubscribeConfigError();
  }
  return env.UNSUBSCRIBE_SECRET;
}

function computeToken(leadId: string): string {
  return createHmac('sha256', getSecret()).update(leadId).digest('hex');
}

/** Stateless — no DB column/lookup needed. The token is deterministic from leadId + a server-only secret. */
export function generateUnsubscribeToken(leadId: string): string {
  return computeToken(leadId);
}

export function verifyUnsubscribeToken(leadId: string, token: string): boolean {
  const expected = computeToken(leadId);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(token, 'hex');

  // Lengths must match before timingSafeEqual (it throws on mismatched lengths) — a length
  // mismatch alone is a safe, non-timing-sensitive rejection (there's nothing secret about a
  // hex string's length).
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function buildUnsubscribeUrl(leadId: string): string {
  const token = generateUnsubscribeToken(leadId);
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/unsubscribe/${leadId}/${token}`;
}
