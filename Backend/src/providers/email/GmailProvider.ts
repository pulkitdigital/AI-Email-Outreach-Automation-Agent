import type {
  BounceEvent,
  EmailProvider,
  ReplyEvent,
  SendEmailParams,
  SendEmailResult,
  UnsubscribeResult,
} from '@bebeyond/shared';

/**
 * Thrown immediately when GmailProvider is constructed (see below) — not just when a method is
 * called. Per the Phase 4 requirement: if EMAIL_PROVIDER=gmail is set before this is wired up,
 * the system must fail loudly and clearly at startup, not crash unexpectedly deep in a queue
 * worker's send flow. providers/email/index.ts's assertEmailProviderReady() is called eagerly
 * at process startup (both the API server and the worker process) specifically to surface this
 * at boot.
 */
export class GmailNotImplementedError extends Error {
  constructor() {
    super(
      'EMAIL_PROVIDER=gmail is not implemented yet. Google Workspace/Gmail API integration is ' +
        'stubbed pending Workspace access resolution on bebeyond.digital (see ' +
        'Docs/ARCHITECTURE.md § 5 Sending Engine and the TODOs in this file). ' +
        'Set EMAIL_PROVIDER=brevo in .env to use the active provider.',
    );
    this.name = 'GmailNotImplementedError';
  }
}

/**
 * Gmail / Google Workspace implementation of EmailProvider — STUBBED.
 *
 * Blocked on: Google Workspace access on bebeyond.digital being resolved (see project notes).
 * Do not start implementing this class until that access exists.
 *
 * TODO (once Workspace access is resolved):
 *  - Remove the `throw` in the constructor below.
 *  - Set up a GCP project + OAuth2 client (or service account with domain-wide delegation) for
 *    the sending mailbox; populate GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REDIRECT_URI /
 *    GMAIL_REFRESH_TOKEN / GMAIL_SENDER_EMAIL in .env.
 *  - sendEmail: build a MIME message (incl. deck attachment), send via
 *    `gmail.users.messages.send` (googleapis), map the response to SendEmailResult.
 *  - Reply detection: call `gmail.users.watch` on the mailbox to push notifications to a
 *    Pub/Sub topic (GMAIL_PUBSUB_TOPIC); backend subscribes (GMAIL_PUBSUB_SUBSCRIPTION) and
 *    calls handleWebhookEvent() with the push payload, which then calls
 *    `gmail.users.history.list` to resolve the actual new message(s).
 *  - handleBounce: Gmail doesn't push bounces the way Brevo does — bounces typically arrive as
 *    a delivery-failure email from mailer-daemon in the same mailbox; detecting these needs its
 *    own parsing rule once this class is implemented.
 *  - checkReplies: could serve as a periodic reconciliation fallback (e.g. `gmail.users.history.list`
 *    since last processed historyId) in case a Pub/Sub push is missed.
 *  - handleUnsubscribe: Gmail/Workspace has no equivalent of Brevo's contact-blacklist API —
 *    our own DB (leads.status = 'do_not_contact') would be the sole authority; this can likely
 *    just be a no-op that returns a result without calling any Google API.
 */
export class GmailProvider implements EmailProvider {
  constructor() {
    throw new GmailNotImplementedError();
  }

  getProviderName(): 'gmail' {
    return 'gmail';
  }

  async sendEmail(_params: SendEmailParams): Promise<SendEmailResult> {
    throw new GmailNotImplementedError();
  }

  async checkReplies(): Promise<ReplyEvent[]> {
    throw new GmailNotImplementedError();
  }

  async handleWebhookEvent(_payload: unknown): Promise<Array<ReplyEvent | BounceEvent>> {
    throw new GmailNotImplementedError();
  }

  async handleBounce(_payload: unknown): Promise<BounceEvent> {
    throw new GmailNotImplementedError();
  }

  async handleUnsubscribe(_email: string): Promise<UnsubscribeResult> {
    throw new GmailNotImplementedError();
  }
}
