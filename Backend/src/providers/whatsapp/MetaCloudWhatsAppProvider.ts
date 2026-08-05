import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  InboundWhatsAppMessage,
  SendWhatsAppFreeformParams,
  SendWhatsAppResult,
  SendWhatsAppTemplateParams,
  WhatsAppProvider,
  WhatsAppProviderName,
} from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { WhatsAppConfigError, WhatsAppFreeformWindowExpiredError } from './errors.js';

const GRAPH_API_VERSION = 'v21.0';
const FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;

interface GraphApiSendResponse {
  messages?: { id: string }[];
}

/**
 * Meta WhatsApp Cloud API implementation of WhatsAppProvider — the only implementation so far
 * (see providers/whatsapp/index.ts's getWhatsAppProvider, mirroring the EMAIL_PROVIDER
 * provider-switch pattern for a future second provider, if one is ever needed).
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  private getCredentials(): { accessToken: string; phoneNumberId: string } {
    if (!env.WHATSAPP_ACCESS_TOKEN) {
      throw new WhatsAppConfigError(
        'WHATSAPP_ACCESS_TOKEN is not set — required to send WhatsApp messages',
      );
    }
    if (!env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new WhatsAppConfigError(
        'WHATSAPP_PHONE_NUMBER_ID is not set — required to send WhatsApp messages',
      );
    }
    return { accessToken: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID };
  }

  getProviderName(): WhatsAppProviderName {
    return 'meta_cloud';
  }

  private async postToGraphApi(body: Record<string, unknown>): Promise<GraphApiSendResponse> {
    const { accessToken, phoneNumberId } = this.getCredentials();
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(`WhatsApp Cloud API request failed (${res.status}): ${errorBody}`);
    }

    return res.json() as Promise<GraphApiSendResponse>;
  }

  /** Sendable any time — Meta allows template messages outside the 24h session window, no opt-in-window check here (that's whatsapp_opted_in, enforced one layer up in whatsappService). */
  async sendTemplateMessage(params: SendWhatsAppTemplateParams): Promise<SendWhatsAppResult> {
    const values = Object.values(params.variables);
    const components =
      values.length > 0
        ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }]
        : undefined;

    const response = await this.postToGraphApi({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.language },
        ...(components ? { components } : {}),
      },
    });

    const externalMessageId = response.messages?.[0]?.id;
    if (!externalMessageId) {
      throw new Error('WhatsApp Cloud API response had no message id');
    }
    return { externalMessageId, providerName: 'meta_cloud', sentAt: new Date() };
  }

  /**
   * Enforces the 24h session window itself, from params.lastInboundAt — see
   * SendWhatsAppFreeformParams's docstring (shared/src/types/whatsapp.ts) for why that must be
   * freshly fetched by the caller rather than trusted as "the caller already checked". Never
   * silently downgrades to a template send; throws WhatsAppFreeformWindowExpiredError instead so
   * the caller/UI makes that call deliberately.
   */
  async sendFreeformMessage(params: SendWhatsAppFreeformParams): Promise<SendWhatsAppResult> {
    const isWithinWindow =
      params.lastInboundAt !== null &&
      Date.now() - params.lastInboundAt.getTime() < FREEFORM_WINDOW_MS;

    if (!isWithinWindow) {
      throw new WhatsAppFreeformWindowExpiredError(params.lastInboundAt);
    }

    const response = await this.postToGraphApi({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: params.body },
    });

    const externalMessageId = response.messages?.[0]?.id;
    if (!externalMessageId) {
      throw new Error('WhatsApp Cloud API response had no message id');
    }
    return { externalMessageId, providerName: 'meta_cloud', sentAt: new Date() };
  }

  /**
   * Meta's Cloud API webhook payload nests inbound messages under
   * entry[].changes[].value.messages[], with delivery/read status updates for OUR outbound
   * messages arriving separately in value.statuses[] — those aren't inbound messages, so they're
   * deliberately skipped here (status tracking is a possible future enhancement, out of scope
   * for this phase). Malformed/unexpected shapes resolve to [] rather than throwing — a webhook
   * payload we can't parse should never crash the route.
   */
  parseWebhookPayload(payload: unknown): InboundWhatsAppMessage[] {
    const entries = (payload as { entry?: unknown })?.entry;
    if (!Array.isArray(entries)) return [];

    const messages: InboundWhatsAppMessage[] = [];

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown })?.changes;
      if (!Array.isArray(changes)) continue;

      for (const change of changes) {
        const value = (change as { value?: { messages?: unknown[] } })?.value;
        const rawMessages = value?.messages;
        if (!Array.isArray(rawMessages)) continue;

        for (const raw of rawMessages) {
          const m = raw as {
            from?: string;
            id?: string;
            timestamp?: string;
            text?: { body?: string };
            type?: string;
          };
          if (!m.from || !m.id) continue;

          messages.push({
            fromPhoneNumber: m.from,
            body: m.type === 'text' ? (m.text?.body ?? '') : `[${m.type ?? 'unsupported'} message]`,
            metaMessageId: m.id,
            receivedAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
            rawPayload: raw,
          });
        }
      }
    }

    return messages;
  }

  /**
   * Meta signs webhook requests with HMAC-SHA256 over the RAW request body, keyed by the app
   * secret, in the `X-Hub-Signature-256: sha256=<hex>` header. Must run against the raw bytes,
   * never a re-serialized JSON.stringify(req.body) — key ordering/whitespace differences would
   * make even a legitimate signature fail to match. See routes/webhooks.ts's rawBody capture
   * (index.ts's express.json({ verify }) hook).
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!env.WHATSAPP_APP_SECRET) {
      throw new WhatsAppConfigError(
        'WHATSAPP_APP_SECRET is not set — required to verify WhatsApp webhook signatures',
      );
    }
    if (!signatureHeader) return false;

    const [scheme, providedHex] = signatureHeader.split('=');
    if (scheme !== 'sha256' || !providedHex) return false;

    const expectedHex = createHmac('sha256', env.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    const providedBuf = Buffer.from(providedHex, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
