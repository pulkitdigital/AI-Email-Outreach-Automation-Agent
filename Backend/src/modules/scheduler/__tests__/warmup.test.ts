import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock: {
  DAILY_EMAIL_LIMIT: number;
  WARMUP_ENABLED: boolean;
  WARMUP_START_DATE: string | undefined;
  WARMUP_START_LIMIT: number;
  WARMUP_GROWTH_RATE: number;
  WARMUP_GROWTH_INTERVAL_DAYS: number;
} = {
  DAILY_EMAIL_LIMIT: 300,
  WARMUP_ENABLED: true,
  WARMUP_START_DATE: '2026-08-01',
  WARMUP_START_LIMIT: 25,
  WARMUP_GROWTH_RATE: 1.2,
  WARMUP_GROWTH_INTERVAL_DAYS: 3,
};
vi.mock('../../../config/env.js', () => ({ env: envMock }));

const { computeEffectiveDailyLimit } = await import('../warmup.js');

beforeEach(() => {
  envMock.DAILY_EMAIL_LIMIT = 300;
  envMock.WARMUP_ENABLED = true;
  envMock.WARMUP_START_DATE = '2026-08-01';
  envMock.WARMUP_START_LIMIT = 25;
  envMock.WARMUP_GROWTH_RATE = 1.2;
  envMock.WARMUP_GROWTH_INTERVAL_DAYS = 3;
});

describe('computeEffectiveDailyLimit', () => {
  it('returns the flat DAILY_EMAIL_LIMIT when warmup is disabled', () => {
    envMock.WARMUP_ENABLED = false;
    expect(computeEffectiveDailyLimit('2026-08-01')).toBe(300);
  });

  it('returns the flat DAILY_EMAIL_LIMIT (with a warning) when enabled but no start date is configured', () => {
    envMock.WARMUP_START_DATE = undefined;
    expect(computeEffectiveDailyLimit('2026-08-01')).toBe(300);
  });

  it('starts at WARMUP_START_LIMIT on day 0', () => {
    expect(computeEffectiveDailyLimit('2026-08-01')).toBe(25);
  });

  it('stays at the start limit until the first growth interval elapses', () => {
    expect(computeEffectiveDailyLimit('2026-08-02')).toBe(25); // day 1
    expect(computeEffectiveDailyLimit('2026-08-03')).toBe(25); // day 2
  });

  it('grows by WARMUP_GROWTH_RATE at each WARMUP_GROWTH_INTERVAL_DAYS boundary', () => {
    // day 3: 1 interval elapsed -> 25 * 1.2 = 30
    expect(computeEffectiveDailyLimit('2026-08-04')).toBe(30);
    // day 6: 2 intervals elapsed -> 25 * 1.2^2 = 36
    expect(computeEffectiveDailyLimit('2026-08-07')).toBe(36);
    // day 9: 3 intervals elapsed -> 25 * 1.2^3 = 43.2 -> floor 43
    expect(computeEffectiveDailyLimit('2026-08-10')).toBe(43);
  });

  it('caps at DAILY_EMAIL_LIMIT once the ramp reaches or exceeds it', () => {
    envMock.DAILY_EMAIL_LIMIT = 40;
    // day 6 would ramp to 36 (under cap)
    expect(computeEffectiveDailyLimit('2026-08-07')).toBe(36);
    // day 9 would ramp to 43 (over the 40 cap) -> clamped to 40
    expect(computeEffectiveDailyLimit('2026-08-10')).toBe(40);
  });

  it('treats a future start date as day 0 (never below the start limit, never above the ceiling)', () => {
    envMock.WARMUP_START_DATE = '2026-09-01';
    expect(computeEffectiveDailyLimit('2026-08-01')).toBe(25);
  });

  it('is a pure function of runDate — same date always yields the same result regardless of call order', () => {
    const first = computeEffectiveDailyLimit('2026-08-07');
    const second = computeEffectiveDailyLimit('2026-08-01');
    const third = computeEffectiveDailyLimit('2026-08-07');
    expect(third).toBe(first);
    expect(second).toBe(25);
  });
});
