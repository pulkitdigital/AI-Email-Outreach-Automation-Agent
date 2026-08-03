import { BrevoClient, BrevoError } from '@getbrevo/brevo';
import type {
  BounceEvent,
  EmailProvider,
  ReplyEvent,
  SendEmailParams,
  SendEmailResult,
  UnsubscribeResult,
} from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { EmailApiError, EmailConfigError, isRetryableStatusCode } from './errors.js';

/**
 * Brevo implementation of EmailProvider, via the official @getbrevo/brevo SDK's transactional
 * email resource (POST /v3/smtp/email under the hood). Sending address confirmed with the user:
 * info@bebeyond.digital (SPF/DKIM/DMARC verification in Brevo to be confirmed by the user
 * before real sends — see Docs/ARCHITECTURE.md § 5).
 */
export class BrevoProvider implements EmailProvider {
  private client: BrevoClient | null = null;

  private getClient(): BrevoClient {
    if (!env.BREVO_API_KEY) {
      throw new EmailConfigError('BREVO_API_KEY is not set — required when EMAIL_PROVIDER=brevo');
    }
    if (!env.BREVO_SENDER_EMAIL) {
      throw new EmailConfigError(
        'BREVO_SENDER_EMAIL is not set — required when EMAIL_PROVIDER=brevo',
      );
    }
    if (!this.client) {
      this.client = new BrevoClient({ apiKey: env.BREVO_API_KEY });
    }
    return this.client;
  }

  getProviderName(): 'brevo' {
    return 'brevo';
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const client = this.getClient();

    try {
      const result = await client.transactionalEmails.sendTransacEmail({
        sender: {
          email: env.BREVO_SENDER_EMAIL,
          name: env.BREVO_SENDER_NAME || 'BeBeyond Digital Solutions',
        },
        to: [{ email: params.to, name: params.toName }],
        subject: params.subject,
        htmlContent: params.html,
        textContent: params.text,
        // Cross-references this send back to sent_emails_log in Brevo's own dashboard/logs.
        tags: [params.internalReferenceId],
      });

      if (!result.messageId) {
        throw new Error('Brevo response had no messageId');
      }

      return { externalMessageId: result.messageId, providerName: 'brevo', sentAt: new Date() };
    } catch (err) {
      if (err instanceof BrevoError) {
        throw new EmailApiError(
          `Brevo send failed (${err.statusCode ?? 'no status'}): ${err.message}`,
          err.statusCode,
          isRetryableStatusCode(err.statusCode),
          err,
        );
      }
      // Network-level failure (no HTTP response at all) — treat as transient/retryable.
      throw new EmailApiError(`Brevo send failed: ${(err as Error).message}`, undefined, true, err);
    }
  }

  /** Brevo is webhook-driven (Inbound Parse) for replies, not poll-driven — legitimately a no-op. */
  async checkReplies(): Promise<ReplyEvent[]> {
    return [];
  }

  /**
   * Best-effort parser for Brevo's inbound payloads. NOT yet verified against a live payload —
   * the webhook route itself isn't wired up until a later phase (see Docs/ARCHITECTURE.md § 5),
   * so this is a documented starting point, not a guarantee. Brevo's Inbound Parse webhook
   * (replies) and its transactional event webhook (bounces/opens/etc.) have different shapes;
   * this dispatches on whichever fields are present.
   */
  async handleWebhookEvent(payload: unknown): Promise<Array<ReplyEvent | BounceEvent>> {
    const events = Array.isArray(payload) ? payload : [payload];
    const results: Array<ReplyEvent | BounceEvent> = [];

    for (const raw of events) {
      if (typeof raw !== 'object' || raw === null) continue;
      const record = raw as Record<string, unknown>;

      const eventType = typeof record.event === 'string' ? record.event : undefined;
      if (
        eventType === 'hard_bounce' ||
        eventType === 'soft_bounce' ||
        eventType === 'blocked' ||
        eventType === 'invalid_email' ||
        eventType === 'unsubscribed'
      ) {
        // 'unsubscribed' is intentionally shaped as a BounceEvent (same event-webhook payload
        // fields as an actual bounce) — replyTrackingService distinguishes the two purely by
        // `reason === 'unsubscribed'` and routes to opt-out handling instead of bounce handling.
        // Keeping one shape here means one dispatch site downstream instead of a second parallel
        // event type.
        results.push({
          providerName: 'brevo',
          externalMessageId: typeof record.id === 'string' ? record.id : undefined,
          email: typeof record.email === 'string' ? record.email : '',
          reason: eventType,
          occurredAt: typeof record.date === 'string' ? new Date(record.date) : new Date(),
          rawPayload: raw,
        });
        continue;
      }

      const fromField = record.From ?? record.from;
      if (typeof fromField === 'string') {
        results.push({
          providerName: 'brevo',
          externalMessageId: typeof record.MessageId === 'string' ? record.MessageId : undefined,
          fromEmail: fromField,
          subject: typeof record.Subject === 'string' ? record.Subject : undefined,
          bodySnapshot: typeof record.RawTextBody === 'string' ? record.RawTextBody : undefined,
          receivedAt: new Date(),
          rawPayload: raw,
        });
      }
    }

    return results;
  }

  async handleBounce(payload: unknown): Promise<BounceEvent> {
    const events = await this.handleWebhookEvent(payload);
    // Excludes reason === 'unsubscribed': that's a BounceEvent-shaped payload too (see
    // handleWebhookEvent above) but is an opt-out, not a delivery failure — routes.webhooks.ts's
    // transactional-events handler calls handleWebhookEvent() directly and dispatches on
    // `reason` itself rather than going through this narrower helper, precisely to keep that
    // distinction intact.
    const bounce = events.find(
      (e): e is BounceEvent => 'email' in e && 'reason' in e && e.reason !== 'unsubscribed',
    );
    if (!bounce) {
      throw new Error('handleBounce: payload did not parse as a bounce event');
    }
    return bounce;
  }

  /**
   * Best-effort provider-level suppression — our own DB (leads.status = 'do_not_contact') is
   * authoritative regardless. Brevo's contact API 404s if the address was never a "contact"
   * (expected for transactional-only senders); falls back to creating one, pre-blacklisted.
   */
  async handleUnsubscribe(email: string): Promise<UnsubscribeResult> {
    const client = this.getClient();

    try {
      await client.contacts.updateContact({ identifier: email, emailBlacklisted: true });
    } catch (err) {
      if (err instanceof BrevoError && err.statusCode === 404) {
        await client.contacts.createContact({ email, emailBlacklisted: true });
      } else {
        throw err;
      }
    }

    return { providerName: 'brevo', email, unsubscribedAt: new Date() };
  }
}
