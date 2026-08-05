import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The explicitly-requested race-condition test: simulate a lead replying exactly between when a
 * followup/final job is claimed and when it's about to send, and prove the send is correctly
 * cancelled — see Docs/ARCHITECTURE.md § 5 "The reply-during-send race".
 *
 * Uses genuine async interleaving (a real setTimeout-based delay inside composeEmail — standing
 * in for a real AI call, the realistic slow step — and a separately-scheduled timer mutating the
 * SAME shared lead-status store sendSequenceEmail reads from) rather than pre-scripted mock
 * call-sequencing, so this proves the mid-flight re-check actually closes the window under real
 * concurrent timing, not just that the code happens to read two mocked values in the right order.
 */

interface FakeLead {
  status: string;
}

const leadsStore = new Map<string, FakeLead>();

const getLeadByIdMock = vi.fn(async (id: string) => {
  const lead = leadsStore.get(id);
  if (!lead) return null;
  return {
    id,
    email: 'lead1@example.com',
    emailNormalized: 'lead1@example.com',
    companyName: 'Acme Co',
    contactName: 'Jane Doe',
    industry: null,
    categoryId: 'cat-1',
    status: lead.status,
  };
});
const updateLeadStatusMock = vi.fn(async (id: string, status: string) => {
  const lead = leadsStore.get(id);
  if (lead) lead.status = status;
});
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  getLeadById: getLeadByIdMock,
  updateLeadStatus: updateLeadStatusMock,
}));

vi.mock('../../../db/repositories/categoriesRepository.js', () => ({
  getCategoryById: vi.fn(async () => ({
    id: 'cat-1',
    name: 'Digital Marketing',
    slug: 'digital-marketing',
    serviceGroup: 'digital_marketing',
  })),
}));

const sequence = { id: 'seq-1', leadId: 'lead-1' };
vi.mock('../../../db/repositories/emailSequencesRepository.js', () => ({
  getSequenceForLead: vi.fn(async () => sequence),
  getOrCreateSequenceForLead: vi.fn(async () => sequence),
  markStageSent: vi.fn(async () => {}),
}));

const claimSendAttemptMock = vi.fn(async () => ({ id: 'log-1', isRetry: false }));
const markSendResultMock = vi.fn(async () => {});
vi.mock('../../../db/repositories/sentEmailsLogRepository.js', () => ({
  claimSendAttempt: claimSendAttemptMock,
  markSendResult: markSendResultMock,
  findCrossLeadSendCollision: vi.fn(async () => null),
  getSentSubjectForStage: vi.fn(async () => 'Original subject'),
}));

vi.mock('../../../db/repositories/pitchDecksRepository.js', () => ({
  getLatestPitchDeckForLead: vi.fn(async () => ({
    id: 'deck-1',
    leadId: 'lead-1',
    generationStatus: 'ready',
    fileKey: 'pitch-decks/lead-1/deck-1.pptx',
    fileUrl: null,
  })),
}));

vi.mock('../../../storage/index.js', () => ({
  getStorageProvider: () => ({ getObject: vi.fn(async () => Buffer.from('fake-pptx-bytes')) }),
}));

vi.mock('../../../db/repositories/dailySummaryRepository.js', () => ({
  getTodayRunDate: vi.fn(() => '2026-07-31'),
  incrementSentCount: vi.fn(async () => {}),
  incrementFailedCount: vi.fn(async () => {}),
  incrementCancelledCount: vi.fn(async () => {}),
}));

vi.mock('../../emailComposer/unsubscribeToken.js', () => ({
  buildUnsubscribeUrl: vi.fn(() => 'https://example.com/unsubscribe/lead-1/token'),
}));

/** Deliberately slow, standing in for a real AI copy-generation call — this is the window the reply needs to land inside. */
const composeEmailMock = vi.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { subject: 'Subject', html: '<p>hi</p>', text: 'hi', usedAiCopy: false };
});
vi.mock('../../emailComposer/composerService.js', () => ({
  composeEmail: composeEmailMock,
}));

const providerSendEmailMock = vi.fn(async () => ({
  externalMessageId: 'ext-1',
  providerName: 'brevo' as const,
  sentAt: new Date(),
}));
vi.mock('../../../providers/email/index.js', () => ({
  getEmailProvider: () => ({ getProviderName: () => 'brevo', sendEmail: providerSendEmailMock }),
}));

const { sendSequenceEmail } = await import('../sendingService.js');

beforeEach(() => {
  leadsStore.clear();
  leadsStore.set('lead-1', { status: 'in_sequence' });
  getLeadByIdMock.mockClear();
  updateLeadStatusMock.mockClear();
  claimSendAttemptMock.mockClear();
  markSendResultMock.mockClear();
  composeEmailMock.mockClear();
  providerSendEmailMock.mockClear();
});

describe('reply-during-send race condition', () => {
  it('cancels a followup send when a reply lands while composeEmail() is still in flight', async () => {
    // Job A: a followup job was already claimed and is now composing (the slow step).
    const sendPromise = sendSequenceEmail('lead-1', 'followup');

    // Job B: a reply "webhook" arrives 10ms later — well inside composeEmail's 30ms delay —
    // and stops the lead's sequence exactly the way replyTrackingService.recordReplyEvent()
    // does (its own unit tests cover that it calls updateLeadStatus this way; what matters here
    // is proving sendSequenceEmail reacts correctly to that write regardless of who made it).
    setTimeout(() => {
      void updateLeadStatusMock('lead-1', 'replied');
    }, 10);

    await expect(sendPromise).resolves.toBeUndefined();

    expect(providerSendEmailMock).not.toHaveBeenCalled();
    expect(markSendResultMock).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('control case: sends normally when no reply lands during composition', async () => {
    await sendSequenceEmail('lead-1', 'followup');

    expect(providerSendEmailMock).toHaveBeenCalledTimes(1);
    expect(markSendResultMock).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'sent' }),
    );
  });

  it('also closes the wider race: a reply already recorded before the job even starts is caught by the top-of-function check', async () => {
    // The job was enqueued while the lead was still 'in_sequence', but by the time BullMQ
    // actually runs it, a reply already landed and updated the DB — sendSequenceEmail must read
    // fresh state at execution time, not whatever was true when the job was enqueued.
    leadsStore.set('lead-1', { status: 'replied' });

    await expect(sendSequenceEmail('lead-1', 'followup')).rejects.toThrow();
    expect(providerSendEmailMock).not.toHaveBeenCalled();
    expect(composeEmailMock).not.toHaveBeenCalled();
  });
});
