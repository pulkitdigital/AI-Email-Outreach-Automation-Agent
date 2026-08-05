import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock: {
  DAILY_EMAIL_LIMIT: number;
  WARMUP_ENABLED: boolean;
  WARMUP_START_DATE: string | undefined;
  WARMUP_START_LIMIT: number;
  WARMUP_GROWTH_RATE: number;
  WARMUP_GROWTH_INTERVAL_DAYS: number;
  SEND_SPREAD_WINDOW_HOURS: number;
} = {
  DAILY_EMAIL_LIMIT: 5,
  WARMUP_ENABLED: false,
  WARMUP_START_DATE: undefined,
  WARMUP_START_LIMIT: 25,
  WARMUP_GROWTH_RATE: 1.2,
  WARMUP_GROWTH_INTERVAL_DAYS: 3,
  SEND_SPREAD_WINDOW_HOURS: 4,
};
vi.mock('../../../config/env.js', () => ({ env: envMock }));

const listDueFollowupsMock = vi.fn();
const listDueFinalsMock = vi.fn();
const countStoppedInRangeMock = vi.fn();
vi.mock('../../../db/repositories/emailSequencesRepository.js', () => ({
  listDueFollowups: listDueFollowupsMock,
  listDueFinals: listDueFinalsMock,
  countStoppedInRange: countStoppedInRangeMock,
}));

const listLeadIdsByStatusMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  listLeadIdsByStatus: listLeadIdsByStatusMock,
}));

const countSentTodayMock = vi.fn();
vi.mock('../../../db/repositories/sentEmailsLogRepository.js', () => ({
  countSentToday: countSentTodayMock,
}));

const recordSchedulerRunMock = vi.fn();
vi.mock('../../../db/repositories/dailySummaryRepository.js', () => ({
  getDayBoundsInSchedulerTimezone: vi.fn(() => ({
    dayStart: new Date('2026-07-31T00:00:00Z'),
    dayEnd: new Date('2026-08-01T00:00:00Z'),
  })),
  getTodayRunDate: vi.fn(() => '2026-07-31'),
  recordSchedulerRun: recordSchedulerRunMock,
}));

const enqueueSendEmailJobMock = vi.fn();
vi.mock('../../../queue/queues.js', () => ({
  enqueueSendEmailJob: enqueueSendEmailJobMock,
}));

const syncRepliesFromProviderMock = vi.fn();
vi.mock('../../replyTracking/replyTrackingService.js', () => ({
  syncRepliesFromProvider: syncRepliesFromProviderMock,
}));

const { runDailyScheduler } = await import('../dailySchedulerService.js');

beforeEach(() => {
  envMock.DAILY_EMAIL_LIMIT = 5;
  envMock.WARMUP_ENABLED = false;
  envMock.WARMUP_START_DATE = undefined;
  envMock.WARMUP_START_LIMIT = 25;
  envMock.WARMUP_GROWTH_RATE = 1.2;
  envMock.WARMUP_GROWTH_INTERVAL_DAYS = 3;
  envMock.SEND_SPREAD_WINDOW_HOURS = 4;
  listDueFollowupsMock.mockReset().mockResolvedValue([]);
  listDueFinalsMock.mockReset().mockResolvedValue([]);
  countStoppedInRangeMock.mockReset().mockResolvedValue({ reply: 0, bounce: 0, unsubscribe: 0 });
  listLeadIdsByStatusMock.mockReset().mockResolvedValue([]);
  countSentTodayMock.mockReset().mockResolvedValue(0);
  recordSchedulerRunMock.mockReset();
  enqueueSendEmailJobMock.mockReset();
  syncRepliesFromProviderMock.mockReset().mockResolvedValue({ processed: 0 });
});

describe('runDailyScheduler', () => {
  it('runs reply-sync first, then queues due followups/finals and fills remaining quota with new leads', async () => {
    listDueFollowupsMock.mockResolvedValue([{ sequenceId: 's1', leadId: 'lead-f1' }]);
    listDueFinalsMock.mockResolvedValue([{ sequenceId: 's2', leadId: 'lead-x1' }]);
    listLeadIdsByStatusMock.mockResolvedValue(['lead-n1', 'lead-n2', 'lead-n3']);
    countSentTodayMock.mockResolvedValue(0);

    const result = await runDailyScheduler();

    // cap 5, priority (followup+final) = 2, remaining = 3 -> all 3 new leads fit
    expect(result).toEqual(
      expect.objectContaining({
        newQueued: 3,
        followupQueued: 1,
        finalQueued: 1,
        priorityExceededCap: false,
        errors: [],
      }),
    );
    expect(enqueueSendEmailJobMock).toHaveBeenCalledWith({ leadId: 'lead-f1', stage: 'followup' });
    expect(enqueueSendEmailJobMock).toHaveBeenCalledWith({ leadId: 'lead-x1', stage: 'final' });
    expect(enqueueSendEmailJobMock).toHaveBeenCalledWith({ leadId: 'lead-n1', stage: 'new' });
    expect(enqueueSendEmailJobMock).toHaveBeenCalledTimes(5);
    expect(syncRepliesFromProviderMock).toHaveBeenCalled();
    expect(recordSchedulerRunMock).toHaveBeenCalledWith(
      '2026-07-31',
      expect.objectContaining({ newQueued: 3, followupQueued: 1, finalQueued: 1 }),
    );
  });

  it('queues ALL deadline-bound followups+finals even when they alone exceed the cap, and queues zero new leads', async () => {
    listDueFollowupsMock.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({ sequenceId: `s${i}`, leadId: `lead-f${i}` })),
    );
    listDueFinalsMock.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({ sequenceId: `t${i}`, leadId: `lead-x${i}` })),
    );
    listLeadIdsByStatusMock.mockResolvedValue(['lead-n1', 'lead-n2']);
    countSentTodayMock.mockResolvedValue(0);

    const result = await runDailyScheduler();

    // priority count = 7 > cap of 5 -> all 7 still queued, 0 new
    expect(result.followupQueued).toBe(4);
    expect(result.finalQueued).toBe(3);
    expect(result.newQueued).toBe(0);
    expect(result.priorityExceededCap).toBe(true);
    expect(result.errors.some((e) => e.includes('exceed DAILY_EMAIL_LIMIT'))).toBe(true);
    expect(enqueueSendEmailJobMock).toHaveBeenCalledTimes(7);
  });

  it('accounts for sends already claimed today when computing remaining quota for new leads', async () => {
    countSentTodayMock.mockResolvedValue(4); // cap 5, 4 already claimed -> only 1 slot left
    listLeadIdsByStatusMock.mockResolvedValue(['lead-n1', 'lead-n2', 'lead-n3']);

    const result = await runDailyScheduler();

    expect(result.newQueued).toBe(1);
  });

  it('continues past a failing step and records the error instead of aborting the whole run', async () => {
    listDueFollowupsMock.mockRejectedValue(new Error('db exploded'));
    listLeadIdsByStatusMock.mockResolvedValue(['lead-n1']);

    const result = await runDailyScheduler();

    expect(result.followupQueued).toBe(0);
    expect(result.newQueued).toBe(1); // later steps still ran
    expect(result.errors.some((e) => e.includes('db exploded'))).toBe(true);
    expect(recordSchedulerRunMock).toHaveBeenCalled(); // summary still written
  });

  it('surfaces stopped-sequence counts (reply/bounce/optout) into the summary', async () => {
    countStoppedInRangeMock.mockResolvedValue({ reply: 2, bounce: 1, unsubscribe: 3 });

    await runDailyScheduler();

    expect(recordSchedulerRunMock).toHaveBeenCalledWith(
      '2026-07-31',
      expect.objectContaining({ skippedReply: 2, skippedBounce: 1, skippedOptout: 3 }),
    );
  });

  describe('warm-up ramp integration', () => {
    it('caps NEW leads at the ramped limit (not DAILY_EMAIL_LIMIT) when warm-up is enabled and below the configured ceiling', async () => {
      envMock.WARMUP_ENABLED = true;
      envMock.WARMUP_START_DATE = '2026-07-31'; // same as the mocked runDate -> day 0 -> ramp = WARMUP_START_LIMIT
      envMock.WARMUP_START_LIMIT = 2;
      // DAILY_EMAIL_LIMIT stays 5 — the ramp (2) is the binding constraint, not the configured ceiling.
      listLeadIdsByStatusMock.mockResolvedValue(['lead-n1', 'lead-n2', 'lead-n3', 'lead-n4']);

      const result = await runDailyScheduler();

      expect(result.newQueued).toBe(2);
      expect(recordSchedulerRunMock).toHaveBeenCalledWith(
        '2026-07-31',
        expect.objectContaining({ dailyCap: 2 }),
      );
    });

    it('is unaffected by warm-up config when WARMUP_ENABLED is false — still uses the flat DAILY_EMAIL_LIMIT', async () => {
      envMock.WARMUP_ENABLED = false;
      envMock.WARMUP_START_DATE = '2026-07-31';
      envMock.WARMUP_START_LIMIT = 1; // would bind hard if it were read at all
      listLeadIdsByStatusMock.mockResolvedValue(['lead-n1', 'lead-n2', 'lead-n3']);

      const result = await runDailyScheduler();

      expect(result.newQueued).toBe(3);
      expect(recordSchedulerRunMock).toHaveBeenCalledWith(
        '2026-07-31',
        expect.objectContaining({ dailyCap: 5 }),
      );
    });
  });
});
