import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendIngestionJobAlreadyContactedItemMock = vi.fn();
const incrementIngestionJobCountersMock = vi.fn();
vi.mock('../../../db/repositories/ingestionJobsRepository.js', () => ({
  appendIngestionJobAlreadyContactedItem: appendIngestionJobAlreadyContactedItemMock,
  incrementIngestionJobCounters: incrementIngestionJobCountersMock,
}));

const upsertLeadMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  upsertLead: upsertLeadMock,
}));

const getContactedSummaryForLeadMock = vi.fn();
vi.mock('../../../db/repositories/sentEmailsLogRepository.js', () => ({
  getContactedSummaryForLead: getContactedSummaryForLeadMock,
}));

const enqueueCategorizationJobMock = vi.fn();
vi.mock('../../../queue/queues.js', () => ({
  enqueueCategorizationJob: enqueueCategorizationJobMock,
}));

const { writeLeadRow } = await import('../leadWriter.js');

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    email: 'lead@acme.com',
    companyName: 'Acme Co',
    rawData: {},
    ...overrides,
  };
}

function upsertResult(overrides: Record<string, unknown> = {}) {
  return {
    record: { id: 'lead-1', email: 'lead@acme.com', companyName: 'Acme Co' },
    wasCreated: false,
    mergedFields: [],
    alreadyContacted: false,
    ...overrides,
  };
}

describe('writeLeadRow', () => {
  beforeEach(() => {
    appendIngestionJobAlreadyContactedItemMock.mockReset();
    incrementIngestionJobCountersMock.mockReset();
    upsertLeadMock.mockReset();
    getContactedSummaryForLeadMock.mockReset();
    enqueueCategorizationJobMock.mockReset();
  });

  it('does not touch already-contacted counters/items for a brand-new lead', async () => {
    upsertLeadMock.mockResolvedValue(upsertResult({ wasCreated: true, alreadyContacted: false }));

    await writeLeadRow('job-1', 'file.csv', baseRow());

    expect(incrementIngestionJobCountersMock).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ totalLeadsAlreadyContacted: 0 }),
    );
    expect(getContactedSummaryForLeadMock).not.toHaveBeenCalled();
    expect(appendIngestionJobAlreadyContactedItemMock).not.toHaveBeenCalled();
    expect(enqueueCategorizationJobMock).toHaveBeenCalledWith({ leadId: 'lead-1' });
  });

  it('does not flag a duplicate that was never emailed', async () => {
    upsertLeadMock.mockResolvedValue(
      upsertResult({ wasCreated: false, mergedFields: [], alreadyContacted: false }),
    );

    await writeLeadRow('job-1', 'file.csv', baseRow());

    expect(incrementIngestionJobCountersMock).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ totalLeadsAlreadyContacted: 0 }),
    );
    expect(getContactedSummaryForLeadMock).not.toHaveBeenCalled();
    expect(appendIngestionJobAlreadyContactedItemMock).not.toHaveBeenCalled();
  });

  it('increments the counter and records the item when the matched lead has already been emailed', async () => {
    upsertLeadMock.mockResolvedValue(
      upsertResult({
        wasCreated: false,
        mergedFields: [],
        alreadyContacted: true,
        record: { id: 'lead-1', email: 'lead@acme.com', companyName: 'Aditya Tech Solutions' },
      }),
    );
    getContactedSummaryForLeadMock.mockResolvedValue({
      sentCount: 2,
      lastSentAt: new Date('2026-07-15T10:00:00.000Z'),
    });

    await writeLeadRow('job-1', 'file.csv', baseRow());

    expect(incrementIngestionJobCountersMock).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ totalLeadsAlreadyContacted: 1 }),
    );
    expect(getContactedSummaryForLeadMock).toHaveBeenCalledWith('lead-1');
    expect(appendIngestionJobAlreadyContactedItemMock).toHaveBeenCalledWith('job-1', {
      email: 'lead@acme.com',
      companyName: 'Aditya Tech Solutions',
      lastSentAt: '2026-07-15T10:00:00.000Z',
      sentCount: 2,
    });
    // A merge/unchanged duplicate that's also already-contacted must never be auto-categorized.
    expect(enqueueCategorizationJobMock).not.toHaveBeenCalled();
  });

  it('records a null lastSentAt as null, not a crash, when the summary has no sent rows yet', async () => {
    upsertLeadMock.mockResolvedValue(upsertResult({ alreadyContacted: true }));
    getContactedSummaryForLeadMock.mockResolvedValue({ sentCount: 0, lastSentAt: null });

    await writeLeadRow('job-1', 'file.csv', baseRow());

    expect(appendIngestionJobAlreadyContactedItemMock).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ lastSentAt: null, sentCount: 0 }),
    );
  });
});
