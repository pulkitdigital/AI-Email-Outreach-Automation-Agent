# Brevo Inbound Parse + Transactional Webhook Setup

This is a one-time manual setup you (the user) need to do in your domain registrar's DNS panel
and in Brevo's dashboard. The backend side (webhook routes, secret verification, reply/bounce/
unsubscribe handling) is already built — see `Backend/src/routes/webhooks.ts` and
`Backend/src/modules/replyTracking/replyTrackingService.ts`.

**Do not point live traffic at this until DNS has propagated and you've confirmed it with me —
DNS changes can take anywhere from a few minutes to several hours to propagate globally.**

## Why a separate subdomain

`bebeyond.digital` (or whatever subdomain you send from, e.g. `info@bebeyond.digital`) already
has — or will have — SPF/DKIM/DMARC records tuned for **outbound** deliverability. Inbound mail
routing (an MX record telling the world "deliver mail for this domain to Brevo's inbound parser")
is a different concern, and mixing the two on the same hostname risks breaking your sending
domain's authentication setup. A dedicated subdomain, e.g. `reply.bebeyond.digital`, exists
_only_ to receive mail and hand it to Brevo — it never sends anything itself, so there's nothing
to protect there.

## DNS records to add

Add these at your DNS provider for `bebeyond.digital`:

| Type | Host                     | Value                               | Priority | TTL  |
| ---- | ------------------------ | ----------------------------------- | -------- | ---- |
| MX   | `reply.bebeyond.digital` | _(see below — get this from Brevo)_ | 10       | 3600 |

**Important — do not copy a hostname from this document as the MX target.** Brevo's exact
inbound-parsing mail server hostname is shown live in your own Brevo dashboard when you set up
Inbound Parsing (see steps below), and can change between Brevo accounts/regions. Copy it from
there, not from any external guide (including this one) which may be stale by the time you read
it.

You do **not** need SPF, DKIM, or DMARC records on `reply.bebeyond.digital` — it never sends
mail, only receives it, so there's no sender authentication to configure for it.

## Brevo dashboard steps

### 1. Inbound Parsing (replies)

1. In Brevo, go to **Transactional → Settings → Inbound Parsing** (menu wording may vary
   slightly by Brevo account tier/version).
2. Add domain: `reply.bebeyond.digital`.
3. Brevo will display the exact MX record value to add — copy it into your DNS provider exactly
   as shown, using the record shape in the table above.
4. Set the webhook URL Brevo should POST parsed replies to:
   ```
   https://<your-public-app-url>/webhooks/brevo/inbound/<BREVO_INBOUND_WEBHOOK_SECRET>
   ```
   Replace `<your-public-app-url>` with your deployed backend's public URL (`PUBLIC_APP_URL` in
   `.env`) and `<BREVO_INBOUND_WEBHOOK_SECRET>` with the actual secret value you generate below —
   the full URL, secret included, is what goes into Brevo's dashboard field. This secret in the
   URL path is how the webhook route verifies a request genuinely came from your own configured
   Brevo integration (Brevo does not HMAC-sign inbound payloads) — see `routes/webhooks.ts`.

### 2. Transactional event webhook (bounces + unsubscribes)

1. Go to **Transactional → Settings → Webhooks**.
2. Add a new webhook with URL:
   ```
   https://<your-public-app-url>/webhooks/brevo/events/<BREVO_EVENTS_WEBHOOK_SECRET>
   ```
   using a **different** secret than the inbound one above.
3. Select these events: `hard_bounce`, `soft_bounce`, `blocked`, `invalid_email`, `unsubscribed`.
   (`delivered`/`opened`/`click` etc. can be added later if you want richer tracking, but aren't
   required for the lead-status logic built in Phase 5.)

### 3. Generate the two secrets

Same technique already used for `UNSUBSCRIBE_SECRET` — run this twice, once per secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the results in `.env`:

```
BREVO_INBOUND_WEBHOOK_SECRET=<first generated value>
BREVO_EVENTS_WEBHOOK_SECRET=<second generated value>
```

## Before testing live

Once you've added the DNS record and configured both webhooks in Brevo:

1. Confirm the MX record has propagated (e.g. `dig MX reply.bebeyond.digital` or an online DNS
   checker shows Brevo's mail server).
2. **Tell me it's done and confirmed** — I'll hold off treating the inbound/reply path as live
   until you do, since testing against a not-yet-propagated DNS record will just look like a
   silent failure and waste your time.
3. After that, we can send a real test reply to a `new`-stage test email and confirm the webhook
   fires, the reply is recorded, and the lead's sequence stops.
