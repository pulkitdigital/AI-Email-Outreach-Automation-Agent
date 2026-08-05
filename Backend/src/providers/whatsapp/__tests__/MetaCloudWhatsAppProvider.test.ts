import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WHATSAPP_APP_SECRET: 'test-app-secret',
  },
}));

const { MetaCloudWhatsAppProvider } = await import('../MetaCloudWhatsAppProvider.js');
const { WhatsAppFreeformWindowExpiredError } = await import('../errors.js');

const HOUR_MS = 60 * 60 * 1000;

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ id: 'wamid.123' }] }),
  });
}

describe('MetaCloudWhatsAppProvider.sendFreeformMessage', () => {
  let provider: InstanceType<typeof MetaCloudWhatsAppProvider>;

  beforeEach(() => {
    provider = new MetaCloudWhatsAppProvider();
    vi.restoreAllMocks();
  });

  it('is blocked outside the 24h window even though the lead is opted in (lastInboundAt > 24h ago)', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    const lastInboundAt = new Date(Date.now() - 25 * HOUR_MS);

    await expect(
      provider.sendFreeformMessage({
        to: '919876543210',
        body: 'hello',
        lastInboundAt,
        internalReferenceId: 'lead-1',
      }),
    ).rejects.toThrow(WhatsAppFreeformWindowExpiredError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is blocked when there has never been an inbound message (lastInboundAt is null)', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      provider.sendFreeformMessage({
        to: '919876543210',
        body: 'hello',
        lastInboundAt: null,
        internalReferenceId: 'lead-1',
      }),
    ).rejects.toThrow(WhatsAppFreeformWindowExpiredError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is allowed inside the 24h window (lastInboundAt 1h ago)', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    const lastInboundAt = new Date(Date.now() - 1 * HOUR_MS);

    const result = await provider.sendFreeformMessage({
      to: '919876543210',
      body: 'hello',
      lastInboundAt,
      internalReferenceId: 'lead-1',
    });

    expect(result.externalMessageId).toBe('wamid.123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('MetaCloudWhatsAppProvider.sendTemplateMessage', () => {
  let provider: InstanceType<typeof MetaCloudWhatsAppProvider>;

  beforeEach(() => {
    provider = new MetaCloudWhatsAppProvider();
    vi.restoreAllMocks();
  });

  it('is allowed regardless of the 24h window (templates have no window check at all)', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.sendTemplateMessage({
      to: '919876543210',
      templateName: 'welcome_message',
      language: 'en',
      variables: { name: 'Acme Co' },
      internalReferenceId: 'lead-1',
    });

    expect(result.externalMessageId).toBe('wamid.123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((requestInit as { body: string }).body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('welcome_message');
  });
});
