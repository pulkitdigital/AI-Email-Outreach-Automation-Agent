import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = { EMAIL_PROVIDER: 'brevo', AI_PROVIDER: 'gemini' };
vi.mock('../../../config/env.js', () => ({ env: envMock }));

const listRecentIngestionJobsMock = vi.fn();
const countIngestionJobsByStatusMock = vi.fn();
vi.mock('../../../db/repositories/ingestionJobsRepository.js', () => ({
  listRecentIngestionJobs: listRecentIngestionJobsMock,
  countIngestionJobsByStatus: countIngestionJobsByStatusMock,
}));

const listLeadsMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  listLeads: listLeadsMock,
}));

const listFailedPitchDecksMock = vi.fn();
vi.mock('../../../db/repositories/pitchDecksRepository.js', () => ({
  listFailedPitchDecks: listFailedPitchDecksMock,
}));

const listSentEmailLogsMock = vi.fn();
vi.mock('../../../db/repositories/sentEmailsLogRepository.js', () => ({
  listSentEmailLogs: listSentEmailLogsMock,
}));

const { getSystemStatus } = await import('../systemStatusService.js');

beforeEach(() => {
  listSentEmailLogsMock.mockReset().mockResolvedValue({ logs: [{ id: 'log-1' }], total: 3 });
  listFailedPitchDecksMock.mockReset().mockResolvedValue({ decks: [{ id: 'deck-1' }], total: 1 });
  listRecentIngestionJobsMock.mockReset().mockResolvedValue([{ id: 'job-1' }]);
  countIngestionJobsByStatusMock.mockReset().mockResolvedValue(2);
  listLeadsMock.mockReset().mockResolvedValue({ leads: [{ id: 'lead-1' }], total: 5 });
});

describe('getSystemStatus', () => {
  it('surfaces the active providers and every failure source with counts + recent items', async () => {
    const status = await getSystemStatus();

    expect(status.emailProvider).toBe('brevo');
    expect(status.aiProvider).toBe('gemini');
    expect(status.failedSends).toEqual({ count: 3, recent: [{ id: 'log-1' }] });
    expect(status.failedDecks).toEqual({ count: 1, recent: [{ id: 'deck-1' }] });
    expect(status.failedIngestions).toEqual({ count: 2, recent: [{ id: 'job-1' }] });
    expect(status.needsReviewLeads).toEqual({ count: 5, recent: [{ id: 'lead-1' }] });
  });

  it('queries failed sends by status=failed and ingestion jobs by failed/partial', async () => {
    await getSystemStatus();

    expect(listSentEmailLogsMock).toHaveBeenCalledWith(
      { status: 'failed' },
      expect.objectContaining({ limit: expect.any(Number) }),
    );
    expect(listRecentIngestionJobsMock).toHaveBeenCalledWith(expect.any(Number), [
      'failed',
      'partial',
    ]);
    expect(listLeadsMock).toHaveBeenCalledWith(
      { status: 'needs_review' },
      expect.objectContaining({ limit: expect.any(Number) }),
    );
  });
});
