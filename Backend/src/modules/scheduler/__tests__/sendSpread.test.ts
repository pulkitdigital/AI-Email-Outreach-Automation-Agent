import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock: { SEND_SPREAD_WINDOW_HOURS: number } = { SEND_SPREAD_WINDOW_HOURS: 4 };
vi.mock('../../../config/env.js', () => ({ env: envMock }));

const { computeSendSpreadDelayMs } = await import('../sendSpread.js');

beforeEach(() => {
  envMock.SEND_SPREAD_WINDOW_HOURS = 4;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeSendSpreadDelayMs', () => {
  it('returns 0 (no spreading) when the window is 0 hours', () => {
    envMock.SEND_SPREAD_WINDOW_HOURS = 0;
    expect(computeSendSpreadDelayMs()).toBe(0);
  });

  it('scales to exactly the window bound at the extremes of Math.random()', () => {
    const windowMs = 4 * 60 * 60 * 1000;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(computeSendSpreadDelayMs()).toBe(0);

    vi.spyOn(Math, 'random').mockReturnValue(0.9999999);
    expect(computeSendSpreadDelayMs()).toBeLessThan(windowMs);
    expect(computeSendSpreadDelayMs()).toBeGreaterThan(windowMs - 1000); // within 1s of the ceiling
  });

  it('never exceeds the configured window across many random draws', () => {
    const windowMs = envMock.SEND_SPREAD_WINDOW_HOURS * 60 * 60 * 1000;
    for (let i = 0; i < 200; i++) {
      const delay = computeSendSpreadDelayMs();
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(windowMs);
    }
  });
});
