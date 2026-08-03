import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLeadByIdMock = vi.fn();
const updateLeadStatusMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  getLeadById: getLeadByIdMock,
  updateLeadStatus: updateLeadStatusMock,
}));

const getCategoryByIdMock = vi.fn();
vi.mock('../../../db/repositories/categoriesRepository.js', () => ({
  getCategoryById: getCategoryByIdMock,
}));

const getSequenceForLeadMock = vi.fn();
const getOrCreateSequenceForLeadMock = vi.fn();
const markStageSentMock = vi.fn();
vi.mock('../../../db/repositories/emailSequencesRepository.js', () => ({
  getSequenceForLead: getSequenceForLeadMock,
  getOrCreateSequenceForLead: getOrCreateSequenceForLeadMock,
  markStageSent: markStageSentMock,
}));

const claimSendAttemptMock = vi.fn();
const markSendResultMock = vi.fn();
const findCrossLeadSendCollisionMock = vi.fn();
vi.mock('../../../db/repositories/sentEmailsLogRepository.js', () => ({
  claimSendAttempt: claimSendAttemptMock,
  markSendResult: markSendResultMock,
  findCrossLeadSendCollision: findCrossLeadSendCollisionMock,
}));

const composeEmailMock = vi.fn();
vi.mock('../../emailComposer/composerService.js', () => ({
  composeEmail: composeEmailMock,
}));

vi.mock('../../emailComposer/unsubscribeToken.js', () => ({
  buildUnsubscribeUrl: vi.fn(() => 'https://example.com/unsubscribe/lead-1/token'),
}));

const providerSendEmailMock = vi.fn();
vi.mock('../../../providers/email/index.js', () => ({
  getEmailProvider: () => ({ getProviderName: () => 'brevo', sendEmail: providerSendEmailMock }),
}));

const getLatestPitchDeckForLeadMock = vi.fn();
vi.mock('../../../db/repositories/pitchDecksRepository.js', () => ({
  getLatestPitchDeckForLead: getLatestPitchDeckForLeadMock,
}));

const getObjectMock = vi.fn();
vi.mock('../../../storage/index.js', () => ({
  getStorageProvider: () => ({ getObject: getObjectMock }),
}));

const incrementSentCountMock = vi.fn();
const incrementFailedCountMock = vi.fn();
const incrementCancelledCountMock = vi.fn();
vi.mock('../../../db/repositories/dailySummaryRepository.js', () => ({
  getTodayRunDate: vi.fn(() => '2026-07-31'),
  incrementSentCount: incrementSentCountMock,
  incrementFailedCount: incrementFailedCountMock,
  incrementCancelledCount: incrementCancelledCountMock,
}));

const { sendSequenceEmail, markSendFailed } = await import('../sendingService.js');
const { SendPreconditionError } = await import('../errors.js');

function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    email: 'lead1@example.com',
    emailNormalized: 'lead1@example.com',
    companyName: 'Acme Co',
    contactName: 'Jane Doe',
    industry: null,
    categoryId: 'cat-1',
    status: 'deck_generated', // Phase 5: 'new' now requires a ready deck, not just 'categorized'
    ...overrides,
  };
}

const category = {
  id: 'cat-1',
  name: 'Digital Marketing',
  slug: 'digital-marketing',
  serviceGroup: 'digital_marketing',
};
const sequence = { id: 'seq-1', leadId: 'lead-1' };
const composed = { subject: 'Subject', html: '<p>hi</p>', text: 'hi', usedAiCopy: false };
const readyDeck = {
  id: 'deck-1',
  leadId: 'lead-1',
  generationStatus: 'ready',
  fileKey: 'pitch-decks/lead-1/deck-1.pptx',
  fileUrl: null,
};

beforeEach(() => {
  getLeadByIdMock.mockReset();
  updateLeadStatusMock.mockReset();
  getCategoryByIdMock.mockReset().mockResolvedValue(category);
  getSequenceForLeadMock.mockReset().mockResolvedValue(sequence);
  getOrCreateSequenceForLeadMock.mockReset().mockResolvedValue(sequence);
  markStageSentMock.mockReset();
  claimSendAttemptMock.mockReset().mockResolvedValue({ id: 'log-1', isRetry: false });
  markSendResultMock.mockReset();
  findCrossLeadSendCollisionMock.mockReset().mockResolvedValue(null);
  composeEmailMock.mockReset().mockResolvedValue(composed);
  providerSendEmailMock.mockReset().mockResolvedValue({
    externalMessageId: 'ext-1',
    providerName: 'brevo',
    sentAt: new Date('2026-01-01T00:00:00Z'),
  });
  getLatestPitchDeckForLeadMock.mockReset().mockResolvedValue(readyDeck);
  getObjectMock.mockReset().mockResolvedValue(Buffer.from('fake-pptx-bytes'));
  incrementSentCountMock.mockReset();
  incrementFailedCountMock.mockReset();
  incrementCancelledCountMock.mockReset();
});

describe('sendSequenceEmail — preconditions', () => {
  it('rejects a stage the lead status does not permit', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'new' }));

    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow(SendPreconditionError);
    expect(providerSendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects sending to a lead that has stopped the sequence (do_not_contact)', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'do_not_contact' }));

    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow(SendPreconditionError);
    expect(providerSendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a lead with no primary category', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ categoryId: null }));

    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow(SendPreconditionError);
    expect(providerSendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a cross-lead email collision (defense in depth)', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    findCrossLeadSendCollisionMock.mockResolvedValue({ otherLeadId: 'lead-2', sentAt: new Date() });

    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow(SendPreconditionError);
    expect(providerSendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a followup/final send when no sequence exists yet', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));
    getSequenceForLeadMock.mockResolvedValue(null);

    await expect(sendSequenceEmail('lead-1', 'followup')).rejects.toThrow(SendPreconditionError);
    expect(providerSendEmailMock).not.toHaveBeenCalled();
  });
});

describe('sendSequenceEmail — successful sends', () => {
  it('sends the new stage and advances the lead to in_sequence', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'deck_generated' }));

    await sendSequenceEmail('lead-1', 'new');

    expect(providerSendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'lead1@example.com',
        subject: composed.subject,
        attachments: expect.arrayContaining([
          expect.objectContaining({ contentType: expect.stringContaining('presentationml') }),
        ]),
      }),
    );
    expect(getObjectMock).toHaveBeenCalledWith('pitch-decks/lead-1/deck-1.pptx');
    expect(markSendResultMock).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'sent', externalMessageId: 'ext-1' }),
    );
    expect(markStageSentMock).toHaveBeenCalledWith(sequence.id, 'new', expect.any(Date));
    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'in_sequence');
    expect(incrementSentCountMock).toHaveBeenCalledWith('2026-07-31', 'new');
  });

  it('rejects a new-stage send when no ready pitch deck exists yet', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'deck_generated' }));
    getLatestPitchDeckForLeadMock.mockResolvedValue({
      id: 'deck-1',
      leadId: 'lead-1',
      generationStatus: 'generating',
      fileKey: null,
      fileUrl: null,
    });

    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow(SendPreconditionError);
    expect(providerSendEmailMock).not.toHaveBeenCalled();
  });

  it('sends the final stage and advances the lead to completed', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));

    await sendSequenceEmail('lead-1', 'final');

    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'completed');
  });

  it('does not change lead status after a followup send (still mid-sequence)', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));

    await sendSequenceEmail('lead-1', 'followup');

    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });

  it('skips cleanly (no error, no send) when the claim indicates an already-sent/in-flight stage', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    claimSendAttemptMock.mockResolvedValue(null);

    await expect(sendSequenceEmail('lead-1', 'new')).resolves.toBeUndefined();
    expect(providerSendEmailMock).not.toHaveBeenCalled();
    expect(composeEmailMock).not.toHaveBeenCalled();
  });
});

describe('sendSequenceEmail — provider failure', () => {
  it('marks the send failed and rethrows, without advancing the sequence or lead status', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'deck_generated' }));
    providerSendEmailMock.mockRejectedValue(new Error('Brevo 500'));

    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow('Brevo 500');

    expect(markSendResultMock).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'failed', errorMessage: 'Brevo 500' }),
    );
    expect(markStageSentMock).not.toHaveBeenCalled();
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
    expect(incrementFailedCountMock).toHaveBeenCalledWith('2026-07-31');
  });
});

describe('sendSequenceEmail — mid-flight cancellation (reply-during-send race)', () => {
  it('cancels the send if the lead becomes ineligible during composeEmail(), without ever calling the provider', async () => {
    // First getLeadById call (top-of-function eligibility check) sees an eligible lead; the
    // SECOND call (the mid-flight re-check, after composeEmail resolves) simulates a reply
    // having landed in between by returning a lead whose status has moved to 'replied'.
    getLeadByIdMock
      .mockResolvedValueOnce(baseLead({ status: 'in_sequence' }))
      .mockResolvedValueOnce(baseLead({ status: 'replied' }));

    await expect(sendSequenceEmail('lead-1', 'followup')).resolves.toBeUndefined();

    expect(providerSendEmailMock).not.toHaveBeenCalled();
    expect(markSendResultMock).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'cancelled' }),
    );
    expect(markStageSentMock).not.toHaveBeenCalled();
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
    expect(incrementCancelledCountMock).toHaveBeenCalledWith('2026-07-31');
  });
});

describe('markSendFailed', () => {
  it('flags an in-sequence lead as needs_review with the send-failed reason', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));

    await markSendFailed('lead-1');

    expect(updateLeadStatusMock).toHaveBeenCalledWith(
      'lead-1',
      'needs_review',
      'email_send_failed',
    );
  });

  it('leaves a lead not currently mid-pipeline untouched', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'do_not_contact' }));

    await markSendFailed('lead-1');

    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });
});
