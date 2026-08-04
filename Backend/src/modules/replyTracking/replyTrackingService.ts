import type { BounceEvent, ReplyEvent } from '@bebeyond/shared';
import { getEmailProvider } from '../../providers/email/index.js';
import { normalizeEmail } from '../ingestion/normalize.js';
import {
  findLeadByNormalizedEmail,
  updateLeadStatus,
} from '../../db/repositories/leadsRepository.js';
import {
  getSequenceForLead,
  stopSequenceForLead,
} from '../../db/repositories/emailSequencesRepository.js';
import {
  findReplyByExternalMessageId,
  recordReply,
} from '../../db/repositories/repliesRepository.js';

/**
 * Provider-agnostic reply/bounce/unsubscribe handling — consumes only the normalized
 * ReplyEvent/BounceEvent shapes from the EmailProvider interface (shared/src/types/email.ts),
 * never anything Brevo-specific. When Gmail/Workspace access is resolved and GmailProvider
 * implements checkReplies()/handleWebhookEvent() for real (Pub/Sub push), this module needs zero
 * changes — see Docs/ARCHITECTURE.md § 5.
 *
 * Every entry point here is deliberately idempotent and defensive: webhook delivery can be
 * duplicated or arrive for an address that isn't a known lead, and none of that should ever
 * throw or corrupt state.
 */

/** Handles "Name <email@domain>" as well as a bare address — Brevo's inbound From field is raw SMTP header text, not guaranteed pre-parsed. */
function extractEmailAddress(raw: string): string {
  const angleMatch = raw.match(/<([^<>]+)>/);
  return normalizeEmail(angleMatch?.[1] ?? raw);
}

export async function recordReplyEvent(event: ReplyEvent): Promise<void> {
  const emailNormalized = extractEmailAddress(event.fromEmail);
  const lead = await findLeadByNormalizedEmail(emailNormalized);

  if (!lead) {
    console.warn(
      `[reply-tracking] reply received from ${emailNormalized}, which does not match any known lead — recording nothing`,
    );
    return;
  }

  if (event.externalMessageId) {
    const existing = await findReplyByExternalMessageId(lead.id, event.externalMessageId);
    if (existing) {
      console.log(
        `[reply-tracking] duplicate reply webhook delivery for lead ${lead.id} (external_message_id ${event.externalMessageId}) — skipping insert`,
      );
      return;
    }
  }

  const sequence = await getSequenceForLead(lead.id);

  await recordReply({
    leadId: lead.id,
    emailSequenceId: sequence?.id ?? null,
    sentEmailLogId: null,
    providerName: event.providerName,
    externalMessageId: event.externalMessageId ?? null,
    fromEmail: event.fromEmail,
    subject: event.subject ?? null,
    bodySnapshot: event.bodySnapshot ?? null,
    rawPayload: event.rawPayload,
    receivedAt: event.receivedAt,
  });

  // do_not_contact is the one status that always wins (see routes/unsubscribe.ts) — an opt-out
  // must never be silently reopened by a later reply.
  if (lead.status !== 'do_not_contact') {
    await updateLeadStatus(lead.id, 'replied');
  }

  await stopSequenceForLead(
    lead.id,
    'stopped_reply',
    `Reply received via ${event.providerName} on ${event.receivedAt.toISOString()}`,
  );
}

export async function recordBounceEvent(event: BounceEvent): Promise<void> {
  const emailNormalized = normalizeEmail(event.email);
  const lead = await findLeadByNormalizedEmail(emailNormalized);

  if (!lead) {
    console.warn(
      `[reply-tracking] bounce event for ${emailNormalized}, which does not match any known lead — ignoring`,
    );
    return;
  }

  if (lead.status !== 'do_not_contact') {
    await updateLeadStatus(lead.id, 'bounced');
  }

  await stopSequenceForLead(
    lead.id,
    'stopped_bounce',
    `Bounce (${event.reason ?? 'unknown reason'}) via ${event.providerName} on ${event.occurredAt.toISOString()}`,
  );
}

/**
 * Permanent opt-out — always wins, unconditionally, same precedent as routes/unsubscribe.ts's
 * own click-through handler. A BounceEvent-shaped payload with reason === 'unsubscribed' (Brevo)
 * or an UnsubscribeResult (any provider's handleUnsubscribe()) both funnel through here.
 */
export async function recordUnsubscribeEvent(email: string, providerName: string): Promise<void> {
  const emailNormalized = normalizeEmail(email);
  const lead = await findLeadByNormalizedEmail(emailNormalized);

  if (!lead) {
    console.warn(
      `[reply-tracking] unsubscribe event for ${emailNormalized}, which does not match any known lead — ignoring`,
    );
    return;
  }

  await updateLeadStatus(lead.id, 'do_not_contact');
  await stopSequenceForLead(lead.id, 'stopped_unsubscribe', `Unsubscribed via ${providerName}`);
}

/**
 * Dispatches one already-normalized provider event to the right handler above. Used by the
 * webhook route after calling provider.handleWebhookEvent(payload) — kept separate from that
 * parsing step so the route stays a thin, testable I/O boundary.
 */
export async function handleProviderEvent(event: ReplyEvent | BounceEvent): Promise<void> {
  if ('fromEmail' in event) {
    await recordReplyEvent(event);
    return;
  }

  if (event.reason === 'unsubscribed') {
    await recordUnsubscribeEvent(event.email, event.providerName);
    return;
  }

  await recordBounceEvent(event);
}

/**
 * Daily Scheduler step 1 ("reply-check sync"). Brevo is webhook-driven, so
 * BrevoProvider.checkReplies() is a documented no-op ([]) here — replies/bounces already arrive
 * in real time via routes/webhooks.ts, not through this polling path. This function exists so
 * the scheduler's step order matches the spec exactly, and so a FUTURE poll-based provider (or a
 * Gmail implementation that batches Pub/Sub notifications) needs no scheduler changes — only
 * checkReplies() itself needs implementing, per the provider-switch design goal.
 */
export async function syncRepliesFromProvider(): Promise<{ processed: number }> {
  const events = await getEmailProvider().checkReplies();
  for (const event of events) {
    await handleProviderEvent(event);
  }
  return { processed: events.length };
}
