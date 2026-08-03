/**
 * EmailProvider contract — see docs/ARCHITECTURE.md § 5 (Sending Engine).
 *
 * Every downstream consumer (scheduler, webhook routes, composer caller) must depend on this
 * interface only, never on a concrete provider class. That's what makes EMAIL_PROVIDER in
 * .env a config change instead of a code change.
 */

export type EmailProviderName = 'brevo' | 'gmail';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Buffer, or a base64 string
  contentType: string;
}

export interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Correlates the send back to sent_emails_log.id before the provider assigns its own id. */
  internalReferenceId: string;
}

export interface SendEmailResult {
  /** Provider-agnostic identity, persisted to sent_emails_log.external_message_id */
  externalMessageId: string;
  providerName: EmailProviderName;
  sentAt: Date;
}

export interface ReplyEvent {
  providerName: EmailProviderName;
  externalMessageId?: string;
  fromEmail: string;
  subject?: string;
  bodySnapshot?: string;
  receivedAt: Date;
  /** Untouched provider payload, persisted to replies.raw_payload for debugging. */
  rawPayload: unknown;
}

export interface BounceEvent {
  providerName: EmailProviderName;
  externalMessageId?: string;
  email: string;
  reason?: string;
  occurredAt: Date;
  rawPayload: unknown;
}

export interface UnsubscribeResult {
  providerName: EmailProviderName;
  email: string;
  unsubscribedAt: Date;
}

/**
 * Implemented by backend/src/providers/email/BrevoProvider.ts (active) and
 * backend/src/providers/email/GmailProvider.ts (stubbed — throws immediately on construction
 * until Google Workspace access is resolved, see docs/ARCHITECTURE.md § 5). Selected at runtime
 * by backend/src/providers/email/index.ts based on process.env.EMAIL_PROVIDER.
 */
export interface EmailProvider {
  getProviderName(): EmailProviderName;

  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Polling-style reply check. Webhook/push-driven providers (Brevo Inbound Parse, Gmail
   * Pub/Sub) may legitimately no-op here and rely on handleWebhookEvent() instead.
   */
  checkReplies(): Promise<ReplyEvent[]>;

  /** Inbound webhook/push payload -> normalized events. Payload shape is provider-specific. */
  handleWebhookEvent(payload: unknown): Promise<Array<ReplyEvent | BounceEvent>>;

  handleBounce(payload: unknown): Promise<BounceEvent>;

  /**
   * Best-effort provider-level suppression (e.g. Brevo contact blacklisting) — a secondary
   * safety net, NOT the source of truth. The application's own DB (leads.status =
   * 'do_not_contact', checked before every send) is authoritative regardless of whether this
   * call succeeds; callers should treat a failure here as loggable, not fatal.
   */
  handleUnsubscribe(email: string): Promise<UnsubscribeResult>;
}
