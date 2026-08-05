/**
 * WhatsApp channel (Meta WhatsApp Cloud API) — mirrors the EmailProvider abstraction in
 * email.ts. See Backend/src/providers/whatsapp/MetaCloudWhatsAppProvider.ts (the only current
 * implementation) and Backend/src/modules/whatsapp/whatsappService.ts (the opt-in-enforcing
 * send path every caller must go through — never call a provider directly).
 *
 * COMPLIANCE: Meta's WhatsApp Business Policy prohibits cold outbound messaging without
 * explicit opt-in. `whatsapp_opted_in` (see WhatsAppOptInSource below) is a hard invariant,
 * re-checked from the DB immediately before every send — see
 * Backend/src/db/repositories/whatsappRepository.ts's sendWhatsAppMessage-adjacent guard.
 */

export type WhatsAppProviderName = 'meta_cloud';

/** How a lead came to be opted in — recorded, never inferred after the fact. */
export type WhatsAppOptInSource = 'click_to_whatsapp' | 'reply_offer' | 'manual';

export type WhatsAppMessageDirection = 'inbound' | 'outbound';

/**
 * 'template': a pre-approved Meta template message — sendable any time, in or out of the 24h
 * session window. 'freeform': a plain text message — only sendable inside the 24h window that
 * opens on the lead's most recent inbound message (whatsapp_last_inbound_at). See
 * MetaCloudWhatsAppProvider.sendFreeformMessage.
 */
export type WhatsAppMessageType = 'template' | 'freeform';

/**
 * Meta's own conversation billing/policy category, recorded per message for reference — not
 * enforced in application logic beyond the freeform/template + 24h-window rule above.
 */
export type WhatsAppConversationCategory = 'marketing' | 'utility' | 'service';

export type WhatsAppMessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'received';

export type WhatsAppTemplateApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface SendWhatsAppTemplateParams {
  to: string;
  templateName: string;
  language: string;
  variables: Record<string, string>;
  /** Correlates the send back to whatsapp_messages_log.id before the provider assigns its own id. */
  internalReferenceId: string;
}

export interface SendWhatsAppFreeformParams {
  to: string;
  body: string;
  /**
   * The lead's whatsapp_last_inbound_at, fetched fresh from the DB by the caller immediately
   * before this call (never a cached/earlier-loaded lead object) — see
   * Backend/src/modules/whatsapp/whatsappService.ts. The provider itself validates this against
   * the 24h window and throws WhatsAppFreeformWindowExpiredError rather than trusting the
   * caller's own judgment about whether it's safe to call this method at all.
   */
  lastInboundAt: Date | null;
  internalReferenceId: string;
}

export interface SendWhatsAppResult {
  /** Provider-agnostic identity, persisted to whatsapp_messages_log.meta_message_id. */
  externalMessageId: string;
  providerName: WhatsAppProviderName;
  sentAt: Date;
}

export interface InboundWhatsAppMessage {
  fromPhoneNumber: string;
  body: string;
  metaMessageId: string;
  receivedAt: Date;
  rawPayload: unknown;
}

/**
 * Implemented by Backend/src/providers/whatsapp/MetaCloudWhatsAppProvider.ts, selected at
 * runtime by Backend/src/providers/whatsapp/index.ts. Every downstream consumer (webhook route,
 * whatsappService) must depend on this interface only, never MetaCloudWhatsAppProvider directly
 * — same provider-switch design goal as EmailProvider.
 */
export interface WhatsAppProvider {
  getProviderName(): WhatsAppProviderName;

  /** Sendable any time — Meta allows template messages outside the 24h session window. */
  sendTemplateMessage(params: SendWhatsAppTemplateParams): Promise<SendWhatsAppResult>;

  /**
   * Sendable ONLY inside the 24h window since the lead's last inbound message. Implementations
   * must verify this themselves (re-reading whatsapp_last_inbound_at from the DB, not trusting
   * the caller) and reject rather than silently downgrade to a template — see
   * MetaCloudWhatsAppProvider.sendFreeformMessage's docstring.
   */
  sendFreeformMessage(params: SendWhatsAppFreeformParams): Promise<SendWhatsAppResult>;

  /** Inbound webhook payload -> normalized message(s). Payload shape is provider-specific. */
  parseWebhookPayload(payload: unknown): InboundWhatsAppMessage[];

  /** HMAC (X-Hub-Signature-256) verification of a raw webhook request body. */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
}
