import { beforeEach, describe, expect, it, vi } from 'vitest';

const findLeadIdByWhatsAppNumberMock = vi.fn();
const findLeadIdByPhoneSuffixMock = vi.fn();
const findWhatsAppMessageByMetaIdMock = vi.fn();
const getLeadWhatsAppStateMock = vi.fn();
const optInLeadForWhatsAppMock = vi.fn();
const recordWhatsAppInboundTimestampMock = vi.fn();
const logWhatsAppMessageMock = vi.fn();

vi.mock('../../../db/repositories/whatsappRepository.js', () => ({
  findLeadIdByWhatsAppNumber: findLeadIdByWhatsAppNumberMock,
  findLeadIdByPhoneSuffix: findLeadIdByPhoneSuffixMock,
  findWhatsAppMessageByMetaId: findWhatsAppMessageByMetaIdMock,
  getLeadWhatsAppState: getLeadWhatsAppStateMock,
  optInLeadForWhatsApp: optInLeadForWhatsAppMock,
  recordWhatsAppInboundTimestamp: recordWhatsAppInboundTimestampMock,
  logWhatsAppMessage: logWhatsAppMessageMock,
}));

const { handleInboundWhatsAppMessage } = await import('../whatsappWebhookService.js');

function inboundMessage(overrides: Record<string, unknown> = {}) {
  return {
    fromPhoneNumber: '919876543210',
    body: 'Hi, this is Acme Co, interested in your services',
    metaMessageId: 'wamid.new-1',
    receivedAt: new Date('2026-08-05T12:00:00Z'),
    rawPayload: { raw: true },
    ...overrides,
  };
}

beforeEach(() => {
  findLeadIdByWhatsAppNumberMock.mockReset();
  findLeadIdByPhoneSuffixMock.mockReset();
  findWhatsAppMessageByMetaIdMock.mockReset();
  getLeadWhatsAppStateMock.mockReset();
  optInLeadForWhatsAppMock.mockReset();
  recordWhatsAppInboundTimestampMock.mockReset();
  logWhatsAppMessageMock.mockReset();

  findWhatsAppMessageByMetaIdMock.mockResolvedValue(null); // not a duplicate, by default
});

describe('handleInboundWhatsAppMessage', () => {
  it('an inbound message from a new (not-yet-opted-in) number triggers opt-in with source click_to_whatsapp', async () => {
    findLeadIdByWhatsAppNumberMock.mockResolvedValue(null);
    findLeadIdByPhoneSuffixMock.mockResolvedValue('lead-1'); // matched via the phone field fallback
    getLeadWhatsAppStateMock.mockResolvedValue({
      id: 'lead-1',
      whatsappNumber: null,
      whatsappOptedIn: false,
      whatsappOptInSource: null,
      whatsappOptInAt: null,
      whatsappLastInboundAt: null,
    });

    const message = inboundMessage();
    await handleInboundWhatsAppMessage(message);

    expect(optInLeadForWhatsAppMock).toHaveBeenCalledWith('lead-1', '919876543210', 'click_to_whatsapp');
    expect(recordWhatsAppInboundTimestampMock).toHaveBeenCalledWith('lead-1', message.receivedAt);
    expect(logWhatsAppMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', direction: 'inbound', metaMessageId: 'wamid.new-1' }),
    );
  });

  it('does not re-opt-in a lead that is already opted in — still refreshes the 24h window and logs', async () => {
    findLeadIdByWhatsAppNumberMock.mockResolvedValue('lead-2');
    getLeadWhatsAppStateMock.mockResolvedValue({
      id: 'lead-2',
      whatsappNumber: '919876543210',
      whatsappOptedIn: true,
      whatsappOptInSource: 'manual',
      whatsappOptInAt: new Date('2026-08-01T00:00:00Z'),
      whatsappLastInboundAt: new Date('2026-08-04T00:00:00Z'),
    });

    const message = inboundMessage({ metaMessageId: 'wamid.new-2' });
    await handleInboundWhatsAppMessage(message);

    expect(optInLeadForWhatsAppMock).not.toHaveBeenCalled();
    expect(recordWhatsAppInboundTimestampMock).toHaveBeenCalledWith('lead-2', message.receivedAt);
    expect(logWhatsAppMessageMock).toHaveBeenCalled();
  });

  it('logs an unmatched message (lead_id null) for manual review when no lead matches the phone number, and never opts anyone in', async () => {
    findLeadIdByWhatsAppNumberMock.mockResolvedValue(null);
    findLeadIdByPhoneSuffixMock.mockResolvedValue(null);

    const message = inboundMessage({ metaMessageId: 'wamid.unmatched' });
    await handleInboundWhatsAppMessage(message);

    expect(optInLeadForWhatsAppMock).not.toHaveBeenCalled();
    expect(recordWhatsAppInboundTimestampMock).not.toHaveBeenCalled();
    expect(logWhatsAppMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: null, direction: 'inbound', status: 'received' }),
    );
  });

  it('is idempotent against a redelivered webhook (same meta_message_id) — no duplicate opt-in or log', async () => {
    findWhatsAppMessageByMetaIdMock.mockResolvedValue({ id: 'existing-log-row' });

    await handleInboundWhatsAppMessage(inboundMessage({ metaMessageId: 'wamid.dup' }));

    expect(findLeadIdByWhatsAppNumberMock).not.toHaveBeenCalled();
    expect(optInLeadForWhatsAppMock).not.toHaveBeenCalled();
    expect(logWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});
