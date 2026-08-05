import type { InboundWhatsAppMessage } from '@bebeyond/shared';
import {
  findLeadIdByPhoneSuffix,
  findLeadIdByWhatsAppNumber,
  findWhatsAppMessageByMetaId,
  getLeadWhatsAppState,
  logWhatsAppMessage,
  optInLeadForWhatsApp,
  recordWhatsAppInboundTimestamp,
} from '../../db/repositories/whatsappRepository.js';

/** WhatsApp `from` is always E.164 digits-only; ingested `phone` is free-text — see findLeadIdByPhoneSuffix's docstring for why a 10-digit suffix match is the fallback. */
function last10Digits(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, '').slice(-10);
}

/**
 * Handles one already-parsed inbound WhatsApp message (see
 * MetaCloudWhatsAppProvider.parseWebhookPayload — the webhook route calls that first, then this
 * per message). Idempotent against webhook redelivery (Meta, like most webhook providers, can
 * and does redeliver the same event) via meta_message_id dedup, mirroring
 * replyTrackingService.recordReplyEvent's external_message_id check.
 *
 * Match order: exact whatsapp_number match first (the number a previous opt-in recorded), then
 * a fallback phone-suffix match against the lead's free-text `phone` field. No match at all is
 * logged as an unmatched row (lead_id NULL) for manual review in the dashboard — never dropped
 * silently.
 */
export async function handleInboundWhatsAppMessage(
  message: InboundWhatsAppMessage,
): Promise<void> {
  const existing = await findWhatsAppMessageByMetaId(message.metaMessageId);
  if (existing) {
    console.log(`[whatsapp-webhook] duplicate inbound message ${message.metaMessageId} — skipping`);
    return;
  }

  let leadId = await findLeadIdByWhatsAppNumber(message.fromPhoneNumber);
  if (!leadId) {
    leadId = await findLeadIdByPhoneSuffix(last10Digits(message.fromPhoneNumber));
  }

  if (!leadId) {
    console.warn(
      `[whatsapp-webhook] inbound message from ${message.fromPhoneNumber} did not match any known lead — logging unmatched for manual review`,
    );
    await logWhatsAppMessage({
      leadId: null,
      direction: 'inbound',
      messageType: 'freeform',
      fromPhoneNumber: message.fromPhoneNumber,
      bodyPreview: message.body.slice(0, 500),
      metaMessageId: message.metaMessageId,
      status: 'received',
      rawPayload: message.rawPayload,
    });
    return;
  }

  const state = await getLeadWhatsAppState(leadId);
  if (state && !state.whatsappOptedIn) {
    // The lead initiating contact IS the opt-in (Meta's own compliance model: an inbound message
    // is affirmative consent to be messaged back) — see shared/src/types/whatsapp.ts.
    await optInLeadForWhatsApp(leadId, message.fromPhoneNumber, 'click_to_whatsapp');
  }

  // Always re-opens the 24h freeform window, whether or not this message was also the opt-in.
  await recordWhatsAppInboundTimestamp(leadId, message.receivedAt);

  await logWhatsAppMessage({
    leadId,
    direction: 'inbound',
    messageType: 'freeform',
    fromPhoneNumber: message.fromPhoneNumber,
    bodyPreview: message.body.slice(0, 500),
    metaMessageId: message.metaMessageId,
    status: 'received',
    rawPayload: message.rawPayload,
  });
}
