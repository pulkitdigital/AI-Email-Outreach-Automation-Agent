import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLeadWhatsAppStateMock = vi.fn();
const logWhatsAppMessageMock = vi.fn();
vi.mock('../../../db/repositories/whatsappRepository.js', () => ({
  getLeadWhatsAppState: getLeadWhatsAppStateMock,
  logWhatsAppMessage: logWhatsAppMessageMock,
}));

const sendTemplateMessageMock = vi.fn();
const sendFreeformMessageMock = vi.fn();
const getWhatsAppProviderMock = vi.fn(() => ({
  sendTemplateMessage: sendTemplateMessageMock,
  sendFreeformMessage: sendFreeformMessageMock,
}));
vi.mock('../../../providers/whatsapp/index.js', () => ({
  getWhatsAppProvider: getWhatsAppProviderMock,
}));

const { sendWhatsAppTemplateMessage, sendWhatsAppFreeformMessage } = await import(
  '../whatsappService.js'
);
const { WhatsAppNotOptedInError, WhatsAppNoNumberError } = await import(
  '../../../providers/whatsapp/errors.js'
);

function optedOutState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    whatsappNumber: '919876543210',
    whatsappOptedIn: false,
    whatsappOptInSource: null,
    whatsappOptInAt: null,
    whatsappLastInboundAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  getLeadWhatsAppStateMock.mockReset();
  logWhatsAppMessageMock.mockReset();
  sendTemplateMessageMock.mockReset();
  sendFreeformMessageMock.mockReset();
  getWhatsAppProviderMock.mockClear();
});

describe('opt-in hard invariant (Task 3)', () => {
  it('blocks a template send when whatsapp_opted_in is false, even though a phone number is on record', async () => {
    getLeadWhatsAppStateMock.mockResolvedValue(optedOutState());

    await expect(
      sendWhatsAppTemplateMessage('lead-1', 'welcome_message', 'en', {}),
    ).rejects.toThrow(WhatsAppNotOptedInError);

    expect(sendTemplateMessageMock).not.toHaveBeenCalled();
    // Not even a failure log — the send was never attempted, nothing to log.
    expect(logWhatsAppMessageMock).not.toHaveBeenCalled();
  });

  it('blocks a freeform send when whatsapp_opted_in is false, even though a phone number is on record', async () => {
    getLeadWhatsAppStateMock.mockResolvedValue(optedOutState());

    await expect(sendWhatsAppFreeformMessage('lead-1', 'hi there')).rejects.toThrow(
      WhatsAppNotOptedInError,
    );

    expect(sendFreeformMessageMock).not.toHaveBeenCalled();
    expect(logWhatsAppMessageMock).not.toHaveBeenCalled();
  });

  it('re-checks whatsapp_opted_in fresh from the DB on every call — never trusts a cached true from a previous check', async () => {
    getLeadWhatsAppStateMock.mockResolvedValueOnce(optedOutState({ whatsappOptedIn: true }));
    sendTemplateMessageMock.mockResolvedValue({
      externalMessageId: 'wamid.1',
      providerName: 'meta_cloud',
      sentAt: new Date(),
    });
    await sendWhatsAppTemplateMessage('lead-1', 'welcome_message', 'en', {});
    expect(sendTemplateMessageMock).toHaveBeenCalledTimes(1);

    // Opted out in between two sends (e.g. the lead unsubscribed) — the second call must re-read
    // state, not reuse the first call's result.
    getLeadWhatsAppStateMock.mockResolvedValueOnce(optedOutState({ whatsappOptedIn: false }));
    await expect(
      sendWhatsAppTemplateMessage('lead-1', 'welcome_message', 'en', {}),
    ).rejects.toThrow(WhatsAppNotOptedInError);
    expect(sendTemplateMessageMock).toHaveBeenCalledTimes(1); // still just the first call
    expect(getLeadWhatsAppStateMock).toHaveBeenCalledTimes(2);
  });

  it('blocks the send when opted in but no whatsapp_number is on record', async () => {
    getLeadWhatsAppStateMock.mockResolvedValue(
      optedOutState({ whatsappOptedIn: true, whatsappNumber: null }),
    );

    await expect(
      sendWhatsAppTemplateMessage('lead-1', 'welcome_message', 'en', {}),
    ).rejects.toThrow(WhatsAppNoNumberError);
    expect(sendTemplateMessageMock).not.toHaveBeenCalled();
  });
});

describe('sendWhatsAppFreeformMessage', () => {
  it('passes the freshly-fetched lastInboundAt through to the provider, not a hardcoded/trusted value', async () => {
    const lastInboundAt = new Date('2026-08-05T10:00:00Z');
    getLeadWhatsAppStateMock.mockResolvedValue(
      optedOutState({ whatsappOptedIn: true, whatsappLastInboundAt: lastInboundAt }),
    );
    sendFreeformMessageMock.mockResolvedValue({
      externalMessageId: 'wamid.2',
      providerName: 'meta_cloud',
      sentAt: new Date(),
    });

    await sendWhatsAppFreeformMessage('lead-1', 'hello');

    expect(sendFreeformMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '919876543210', body: 'hello', lastInboundAt }),
    );
  });

  it('logs a failed attempt (and rethrows) when the provider rejects, e.g. window-expired', async () => {
    getLeadWhatsAppStateMock.mockResolvedValue(optedOutState({ whatsappOptedIn: true }));
    sendFreeformMessageMock.mockRejectedValue(new Error('24h window closed'));

    await expect(sendWhatsAppFreeformMessage('lead-1', 'hello')).rejects.toThrow(
      '24h window closed',
    );

    expect(logWhatsAppMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', status: 'failed', direction: 'outbound' }),
    );
  });
});
