import { beforeEach, describe, expect, it, vi } from 'vitest';

const findLeadByNormalizedEmailMock = vi.fn();
const updateLeadStatusMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  findLeadByNormalizedEmail: findLeadByNormalizedEmailMock,
  updateLeadStatus: updateLeadStatusMock,
}));

const getSequenceForLeadMock = vi.fn();
const stopSequenceForLeadMock = vi.fn();
vi.mock('../../../db/repositories/emailSequencesRepository.js', () => ({
  getSequenceForLead: getSequenceForLeadMock,
  stopSequenceForLead: stopSequenceForLeadMock,
}));

const findReplyByExternalMessageIdMock = vi.fn();
const recordReplyMock = vi.fn();
vi.mock('../../../db/repositories/repliesRepository.js', () => ({
  findReplyByExternalMessageId: findReplyByExternalMessageIdMock,
  recordReply: recordReplyMock,
}));

const checkRepliesMock = vi.fn();
vi.mock('../../../providers/email/index.js', () => ({
  getEmailProvider: () => ({ checkReplies: checkRepliesMock }),
}));

const {
  recordReplyEvent,
  recordBounceEvent,
  recordUnsubscribeEvent,
  handleProviderEvent,
  syncRepliesFromProvider,
} = await import('../replyTrackingService.js');

const lead = {
  id: 'lead-1',
  emailNormalized: 'lead1@example.com',
  status: 'in_sequence',
};

beforeEach(() => {
  findLeadByNormalizedEmailMock.mockReset().mockResolvedValue(lead);
  updateLeadStatusMock.mockReset();
  getSequenceForLeadMock.mockReset().mockResolvedValue({ id: 'seq-1' });
  stopSequenceForLeadMock.mockReset();
  findReplyByExternalMessageIdMock.mockReset().mockResolvedValue(null);
  recordReplyMock.mockReset();
  checkRepliesMock.mockReset();
});

describe('recordReplyEvent', () => {
  const baseEvent = {
    providerName: 'brevo' as const,
    fromEmail: 'lead1@example.com',
    receivedAt: new Date('2026-07-31T10:00:00Z'),
    rawPayload: { raw: true },
  };

  it('records the reply, marks the lead replied, and stops the sequence', async () => {
    await recordReplyEvent(baseEvent);

    expect(recordReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', fromEmail: 'lead1@example.com' }),
    );
    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'replied');
    expect(stopSequenceForLeadMock).toHaveBeenCalledWith(
      'lead-1',
      'stopped_reply',
      expect.any(String),
    );
  });

  it('extracts the bare address out of a "Name <email>" From header', async () => {
    await recordReplyEvent({ ...baseEvent, fromEmail: 'Jane Doe <lead1@example.com>' });

    expect(findLeadByNormalizedEmailMock).toHaveBeenCalledWith('lead1@example.com');
  });

  it('does nothing when the reply does not match any known lead', async () => {
    findLeadByNormalizedEmailMock.mockResolvedValue(null);

    await expect(recordReplyEvent(baseEvent)).resolves.toBeUndefined();

    expect(recordReplyMock).not.toHaveBeenCalled();
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
    expect(stopSequenceForLeadMock).not.toHaveBeenCalled();
  });

  it('never overwrites a do_not_contact lead back to replied', async () => {
    findLeadByNormalizedEmailMock.mockResolvedValue({ ...lead, status: 'do_not_contact' });

    await recordReplyEvent(baseEvent);

    expect(updateLeadStatusMock).not.toHaveBeenCalled();
    // The sequence stop is still requested — stopSequenceForLead's own idempotency (tested in
    // emailSequencesRepository) is what actually prevents any harmful effect here.
    expect(stopSequenceForLeadMock).toHaveBeenCalled();
  });

  it('skips inserting a duplicate reply row on redelivery of the same webhook (by external_message_id)', async () => {
    findReplyByExternalMessageIdMock.mockResolvedValue({ id: 'reply-1' });

    await recordReplyEvent({ ...baseEvent, externalMessageId: 'msg-1' });

    expect(recordReplyMock).not.toHaveBeenCalled();
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
    expect(stopSequenceForLeadMock).not.toHaveBeenCalled();
  });
});

describe('recordBounceEvent', () => {
  const bounceEvent = {
    providerName: 'brevo' as const,
    email: 'lead1@example.com',
    reason: 'hard_bounce',
    occurredAt: new Date('2026-07-31T10:00:00Z'),
    rawPayload: {},
  };

  it('marks the lead bounced and stops the sequence', async () => {
    await recordBounceEvent(bounceEvent);

    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'bounced');
    expect(stopSequenceForLeadMock).toHaveBeenCalledWith(
      'lead-1',
      'stopped_bounce',
      expect.any(String),
    );
  });

  it('never overwrites a do_not_contact lead back to bounced', async () => {
    findLeadByNormalizedEmailMock.mockResolvedValue({ ...lead, status: 'do_not_contact' });

    await recordBounceEvent(bounceEvent);

    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });

  it('does nothing for an unmatched email', async () => {
    findLeadByNormalizedEmailMock.mockResolvedValue(null);

    await expect(recordBounceEvent(bounceEvent)).resolves.toBeUndefined();
    expect(stopSequenceForLeadMock).not.toHaveBeenCalled();
  });
});

describe('recordUnsubscribeEvent', () => {
  it('marks the lead do_not_contact unconditionally and stops the sequence', async () => {
    await recordUnsubscribeEvent('lead1@example.com', 'brevo');

    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'do_not_contact');
    expect(stopSequenceForLeadMock).toHaveBeenCalledWith(
      'lead-1',
      'stopped_unsubscribe',
      expect.any(String),
    );
  });
});

describe('handleProviderEvent', () => {
  it('dispatches a ReplyEvent (has fromEmail) to recordReplyEvent', async () => {
    await handleProviderEvent({
      providerName: 'brevo',
      fromEmail: 'lead1@example.com',
      receivedAt: new Date(),
      rawPayload: {},
    });

    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'replied');
  });

  it('dispatches a BounceEvent with reason "unsubscribed" to recordUnsubscribeEvent', async () => {
    await handleProviderEvent({
      providerName: 'brevo',
      email: 'lead1@example.com',
      reason: 'unsubscribed',
      occurredAt: new Date(),
      rawPayload: {},
    });

    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'do_not_contact');
  });

  it('dispatches any other BounceEvent to recordBounceEvent', async () => {
    await handleProviderEvent({
      providerName: 'brevo',
      email: 'lead1@example.com',
      reason: 'hard_bounce',
      occurredAt: new Date(),
      rawPayload: {},
    });

    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'bounced');
  });
});

describe('syncRepliesFromProvider', () => {
  it('processes every event checkReplies() returns and reports the count', async () => {
    checkRepliesMock.mockResolvedValue([
      {
        providerName: 'brevo',
        fromEmail: 'lead1@example.com',
        receivedAt: new Date(),
        rawPayload: {},
      },
    ]);

    const result = await syncRepliesFromProvider();

    expect(result).toEqual({ processed: 1 });
    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'replied');
  });

  it('is a documented no-op when the provider has nothing to report (Brevo, webhook-driven)', async () => {
    checkRepliesMock.mockResolvedValue([]);

    const result = await syncRepliesFromProvider();

    expect(result).toEqual({ processed: 0 });
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });
});
