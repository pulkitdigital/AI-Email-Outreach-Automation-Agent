import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { handleProviderEvent } from '../modules/replyTracking/replyTrackingService.js';
import { getEmailProvider } from '../providers/email/index.js';

export const webhooksRouter = Router();

/**
 * Brevo does not HMAC-sign webhook payloads by default, so authenticity here is verified by a
 * high-entropy secret embedded as a URL path segment — configure Brevo's dashboard with the
 * FULL url including the secret (see Docs/BREVO_INBOUND_SETUP.md), never the bare route. A
 * missing/unconfigured expected secret always rejects, rather than silently accepting everything.
 */
function verifySecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Shared handling for both webhook endpoints below: parse via the active EmailProvider (never
 * Brevo-specific code here — see Docs/ARCHITECTURE.md § 5 provider-switch design goal) and
 * dispatch each normalized event to replyTrackingService. Always resolves to a 200 once
 * authenticated — a malformed or unexpected payload is logged, not surfaced as a webhook
 * failure, so Brevo never enters a retry storm over a body it can't parse. Auth failures alone
 * get a 401 (handled by callers before this function is reached).
 */
async function processWebhookPayload(payload: unknown): Promise<{ received: number }> {
  const events = await getEmailProvider().handleWebhookEvent(payload);
  for (const event of events) {
    await handleProviderEvent(event);
  }
  return { received: events.length };
}

/**
 * Brevo Inbound Parse webhook (replies) — see Docs/BREVO_INBOUND_SETUP.md for the DNS/dashboard
 * setup. Payload shape is a documented best-effort parse (BrevoProvider.handleWebhookEvent) not
 * yet verified against a live delivery; if Brevo's actual inbound payload turns out to be
 * form-encoded rather than JSON, this route's body parsing (relies on the global express.json()
 * in index.ts) will need a matching content-type-specific parser added here.
 */
webhooksRouter.post('/brevo/inbound/:secret', async (req, res) => {
  if (!verifySecret(req.params.secret, env.BREVO_INBOUND_WEBHOOK_SECRET)) {
    console.warn('[webhooks] rejected brevo inbound request: secret mismatch or not configured');
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const result = await processWebhookPayload(req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error('[webhooks] brevo inbound handling failed:', err);
    res.status(200).json({ received: 0, error: 'processing failed, see server logs' });
  }
});

/** Brevo transactional event webhook (hard/soft bounces, blocks, unsubscribes) — see Docs/BREVO_INBOUND_SETUP.md. */
webhooksRouter.post('/brevo/events/:secret', async (req, res) => {
  if (!verifySecret(req.params.secret, env.BREVO_EVENTS_WEBHOOK_SECRET)) {
    console.warn('[webhooks] rejected brevo events request: secret mismatch or not configured');
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const result = await processWebhookPayload(req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error('[webhooks] brevo events handling failed:', err);
    res.status(200).json({ received: 0, error: 'processing failed, see server logs' });
  }
});
