import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { handleProviderEvent } from '../modules/replyTracking/replyTrackingService.js';
import { handleInboundWhatsAppMessage } from '../modules/whatsapp/whatsappWebhookService.js';
import { getEmailProvider } from '../providers/email/index.js';
import { getWhatsAppProvider } from '../providers/whatsapp/index.js';

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

/**
 * GET /webhooks/whatsapp — Meta's one-time webhook verification handshake (configured in the
 * Meta App Dashboard). Meta calls this with hub.mode=subscribe, hub.verify_token (must match
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN), and hub.challenge (echoed back verbatim as plain text on
 * success — that's what proves this endpoint is reachable and under our control).
 */
webhooksRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    typeof token === 'string' &&
    typeof challenge === 'string' &&
    env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
    token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    res.status(200).send(challenge);
    return;
  }

  console.warn('[webhooks] rejected whatsapp verification handshake: token mismatch or not configured');
  res.sendStatus(403);
});

/**
 * POST /webhooks/whatsapp — inbound messages (and, per Meta's payload shape, delivery/read
 * status updates for our own outbound messages, which parseWebhookPayload deliberately ignores —
 * see its docstring). Authenticity verified via Meta's HMAC signature (X-Hub-Signature-256) over
 * the raw request body — see MetaCloudWhatsAppProvider.verifyWebhookSignature and
 * src/types/express.d.ts's rawBody capture. Always resolves 200 once authenticated, same
 * "never let a malformed payload trigger a webhook retry storm" precedent as the Brevo routes
 * above — an auth failure alone gets a 401.
 */
webhooksRouter.post('/whatsapp', async (req, res) => {
  const provider = getWhatsAppProvider();
  const signatureHeader = req.header('x-hub-signature-256');

  let signatureValid: boolean;
  try {
    signatureValid = provider.verifyWebhookSignature(req.rawBody ?? Buffer.alloc(0), signatureHeader);
  } catch (err) {
    console.error('[webhooks] whatsapp signature verification misconfigured:', err);
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!signatureValid) {
    console.warn('[webhooks] rejected whatsapp webhook request: signature mismatch');
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const messages = provider.parseWebhookPayload(req.body);
    for (const message of messages) {
      await handleInboundWhatsAppMessage(message);
    }
    res.status(200).json({ received: messages.length });
  } catch (err) {
    console.error('[webhooks] whatsapp inbound handling failed:', err);
    res.status(200).json({ received: 0, error: 'processing failed, see server logs' });
  }
});
