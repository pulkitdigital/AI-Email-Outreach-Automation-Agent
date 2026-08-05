import type { EmailAttachment, LeadStatus } from '@bebeyond/shared';
import { getCategoryById } from '../../db/repositories/categoriesRepository.js';
import {
  getOrCreateSequenceForLead,
  getSequenceForLead,
  markStageSent,
  type SendableStage,
} from '../../db/repositories/emailSequencesRepository.js';
import {
  getLeadById,
  updateLeadStatus,
  type LeadRecord,
} from '../../db/repositories/leadsRepository.js';
import {
  getLatestPitchDeckForLead,
  type PitchDeckRecord,
} from '../../db/repositories/pitchDecksRepository.js';
import {
  claimSendAttempt,
  findCrossLeadSendCollision,
  markSendResult,
} from '../../db/repositories/sentEmailsLogRepository.js';
import {
  getTodayRunDate,
  incrementCancelledCount,
  incrementFailedCount,
  incrementSentCount,
} from '../../db/repositories/dailySummaryRepository.js';
import { composeEmail } from '../emailComposer/composerService.js';
import { renderPlainTextAsHtml } from '../emailComposer/emailTemplate.js';
import { buildUnsubscribeUrl } from '../emailComposer/unsubscribeToken.js';
import { buildClickToWhatsAppLink } from '../whatsapp/clickToWhatsapp.js';
import type { ComposedEmail } from '../emailComposer/types.js';
import { SERVICE_CATEGORIES } from '../deckGeneration/serviceCatalog.js';
import { getEmailProvider } from '../../providers/email/index.js';
import { getStorageProvider } from '../../storage/index.js';
import { SendPreconditionError } from './errors.js';

/**
 * Which lead statuses are eligible to receive each stage — anything else is a precondition
 * violation, not a transient failure. 'new' requires 'deck_generated' specifically (not merely
 * 'categorized') as of Phase 5: the 'new' email now attaches the lead's pitch deck, so a deck
 * must actually exist and be ready before a 'new' send can be attempted at all.
 */
const ELIGIBLE_STATUSES_BY_STAGE: Record<SendableStage, LeadStatus[]> = {
  new: ['deck_generated'],
  followup: ['in_sequence'],
  final: ['in_sequence'],
};

const DECK_PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Outreach emails attach the LibreOffice-converted .pdf (pdfFileKey), not the raw .pptx
 * (fileKey) — see deckGenerationService.ts's generateDeckForLead for why conversion happens at
 * generation time. Requiring pdfFileKey here (not just fileKey) means a deck generated before
 * this pipeline change existed (fileKey set, pdfFileKey still null) is correctly treated as
 * NOT ready to send — same "no ready pitch deck found" precondition error a lead with no deck
 * at all would get — rather than silently falling back to attaching the pptx.
 */
function assertDeckReady(
  leadId: string,
  deck: PitchDeckRecord | null,
): asserts deck is PitchDeckRecord & { pdfFileKey: string } {
  if (!deck || deck.generationStatus !== 'ready' || !deck.pdfFileKey) {
    throw new SendPreconditionError(
      `Cannot send 'new' stage to lead ${leadId}: no ready pitch deck PDF found ` +
        `(status is '${deck?.generationStatus ?? 'none'}', pdfFileKey is ` +
        `'${deck?.pdfFileKey ?? 'null'}' — regenerate the deck if it predates PDF conversion)`,
    );
  }
}

/**
 * Builds the composed email a stage send would use for `lead`, via composeEmail() (AI copy with
 * static-template fallback — see composerService.ts). Shared by sendSequenceEmail (the real
 * send) and previewSequenceEmail (the "edit before sending" preview, Feature B) so the two paths
 * can never drift apart on how content is composed.
 */
async function composeForLead(lead: LeadRecord, stage: SendableStage): Promise<ComposedEmail> {
  if (!lead.categoryId) {
    throw new SendPreconditionError(`Cannot compose: lead ${lead.id} has no primary category yet`);
  }
  const category = await getCategoryById(lead.categoryId);
  if (!category) {
    throw new SendPreconditionError(
      `Cannot compose: lead ${lead.id}'s category ${lead.categoryId} no longer exists`,
    );
  }
  const categoryServices = SERVICE_CATEGORIES.find((c) => c.slug === category.slug)?.services ?? [];

  return composeEmail({
    leadId: lead.id,
    companyName: lead.companyName ?? lead.contactName ?? 'your business',
    contactName: lead.contactName,
    industry: lead.industry,
    primaryCategoryName: category.name,
    primaryCategoryServices: categoryServices,
    stage,
    unsubscribeUrl: buildUnsubscribeUrl(lead.id),
    whatsappCtaUrl: buildClickToWhatsAppLink(lead.companyName),
  });
}

/**
 * Feature B ("edit before sending"): returns the subject + full body that a real send for this
 * (lead, stage) would currently produce, without claiming a send slot, calling the email
 * provider, or writing to sent_emails_log — purely a read of what composeForLead() would
 * generate right now. The dashboard shows this in an editable modal; if the user edits it and
 * confirms, the edited text comes back as `override` on sendSequenceEmail below.
 */
export async function previewSequenceEmail(
  leadId: string,
  stage: SendableStage,
): Promise<{ subject: string; body: string }> {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new SendPreconditionError(`Cannot preview: lead not found (${leadId})`);
  }

  const composed = await composeForLead(lead, stage);
  return { subject: composed.subject, body: composed.text };
}

export interface SendContentOverride {
  subject: string;
  /** Full body text, in the same shape previewSequenceEmail returns (i.e. composed.text) — edited freely by the user. */
  body: string;
}

/**
 * Sends exactly one sequence-stage email for one lead, with dedup as a hard gate at every
 * layer:
 *  1. Lead must exist, have a category, and be in a status that's actually eligible for this
 *     stage (e.g. a 'do_not_contact'/'bounced'/'replied'/'completed' lead is never eligible for
 *     anything — this is what makes "never send to an address that has stopped the sequence"
 *     hold, structurally, not by convention). 'new' additionally requires a ready pitch deck.
 *  2. Cross-lead collision check: no other lead sharing this normalized email may have ever
 *     been sent anything (defense in depth beyond leads.email_normalized's UNIQUE constraint).
 *  3. claimSendAttempt() — the DB-level, race-safe "has this (lead, stage) already been sent or
 *     is another attempt in flight right now" gate (see sentEmailsLogRepository.ts).
 *  4. A SECOND lead-eligibility re-check immediately before the provider call, after
 *     composeEmail() has run (Phase 5) — composeEmail may call an AI provider, the realistic
 *     longest window in this whole function, during which a reply/bounce/unsubscribe webhook
 *     could land and stop the sequence. Without this re-check, a follow-up/final job that was
 *     already claimed and mid-composition when a reply arrives would still send. This is the
 *     race condition Docs/ARCHITECTURE.md § 5 and the test suite explicitly call out; a
 *     zero-width race remains theoretically possible once the provider HTTP call is actually in
 *     flight, but that gap can never be closed from this side.
 * Only after all of this does this compose and actually call the provider. See
 * Docs/ARCHITECTURE.md § 5.
 *
 * `override` (Feature B, "edit before sending"): when provided, skips composeForLead()/
 * composeEmail() entirely and sends exactly the given subject/body instead — the one-time,
 * per-send content a user reviewed and edited via previewSequenceEmail() above. Every dedup/
 * eligibility/claimSendAttempt gate above is unaffected; only the content that gets composed
 * changes. Not persisted anywhere beyond this one sent_emails_log row's body_snapshot.
 */
export async function sendSequenceEmail(
  leadId: string,
  stage: SendableStage,
  override?: SendContentOverride,
): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error(`Cannot send: lead not found (${leadId})`);
  }

  if (!ELIGIBLE_STATUSES_BY_STAGE[stage].includes(lead.status)) {
    throw new SendPreconditionError(
      `Cannot send stage '${stage}' to lead ${leadId}: status is '${lead.status}', not one of [${ELIGIBLE_STATUSES_BY_STAGE[stage].join(', ')}]`,
    );
  }

  if (!lead.categoryId) {
    throw new SendPreconditionError(`Cannot send: lead ${leadId} has no primary category yet`);
  }

  let deck: (PitchDeckRecord & { pdfFileKey: string }) | null = null;
  if (stage === 'new') {
    const latestDeck = await getLatestPitchDeckForLead(leadId);
    assertDeckReady(leadId, latestDeck);
    deck = latestDeck;
  }

  const collision = await findCrossLeadSendCollision(leadId, lead.emailNormalized);
  if (collision) {
    throw new SendPreconditionError(
      `Dedup violation: lead ${leadId} (${lead.emailNormalized}) shares its email with lead ` +
        `${collision.otherLeadId}, which has already been sent an email. Refusing to send.`,
    );
  }

  let sequence = await getSequenceForLead(leadId);
  if (!sequence) {
    if (stage !== 'new') {
      throw new SendPreconditionError(
        `Cannot send stage '${stage}' for lead ${leadId}: no sequence exists yet (expected 'new' to be sent first)`,
      );
    }
    sequence = await getOrCreateSequenceForLead(leadId);
  }

  const provider = getEmailProvider();

  const claim = await claimSendAttempt({
    leadId,
    emailSequenceId: sequence.id,
    categoryId: lead.categoryId,
    pitchDeckId: deck?.id ?? null,
    stage,
    providerName: provider.getProviderName(),
    subject: '(pending composition)',
  });

  if (!claim) {
    console.log(`[sending] lead ${leadId} stage '${stage}' already sent or in flight — skipping`);
    return;
  }

  // composeForLead()/composeEmail() never throws — it falls back to a static template internally
  // on AI failure (see composerService.ts) — so a send is never blocked by an AI provider hiccup.
  // `override` skips composition altogether and sends exactly the user-edited content instead.
  const composed: ComposedEmail = override
    ? {
        subject: override.subject,
        html: renderPlainTextAsHtml(override.body),
        text: override.body,
        usedAiCopy: false,
      }
    : await composeForLead(lead, stage);

  const recheckLead = await getLeadById(leadId);
  if (!recheckLead || !ELIGIBLE_STATUSES_BY_STAGE[stage].includes(recheckLead.status)) {
    await markSendResult(claim.id, {
      status: 'cancelled',
      subject: composed.subject,
      errorMessage: `Lead became ineligible during composition (status now '${recheckLead?.status ?? 'not found'}')`,
    });
    await incrementCancelledCount(getTodayRunDate());
    console.log(
      `[sending] lead ${leadId} stage '${stage}' cancelled mid-flight — became ineligible during composition`,
    );
    return;
  }

  let attachments: EmailAttachment[] | undefined;
  if (stage === 'new' && deck) {
    const deckBytes = await getStorageProvider().getObject(deck.pdfFileKey);
    attachments = [
      {
        filename: `${(lead.companyName ?? 'pitch-deck').replace(/[^a-z0-9]+/gi, '-')}.pdf`,
        content: deckBytes,
        contentType: DECK_PDF_CONTENT_TYPE,
      },
    ];
  }

  let result;
  try {
    result = await provider.sendEmail({
      to: lead.email,
      toName: lead.contactName ?? undefined,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
      attachments,
      internalReferenceId: claim.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSendResult(claim.id, {
      status: 'failed',
      subject: composed.subject,
      errorMessage: message,
    });
    await incrementFailedCount(getTodayRunDate());
    throw err; // let the worker's attempt-aware retry/give-up logic decide what happens next
  }

  const sentAt = result.sentAt;
  await markSendResult(claim.id, {
    status: 'sent',
    subject: composed.subject,
    externalMessageId: result.externalMessageId,
    bodySnapshot: composed.text,
    sentAt,
    errorMessage: null,
  });

  await markStageSent(sequence.id, stage, sentAt);
  await incrementSentCount(getTodayRunDate(), stage);

  if (stage === 'new') {
    await updateLeadStatus(leadId, 'in_sequence');
  } else if (stage === 'final') {
    await updateLeadStatus(leadId, 'completed');
  }
}

/**
 * Called by the sending worker once BullMQ retries are exhausted (or immediately on a
 * non-retryable EmailApiError/SendPreconditionError) — the documented fallback: the sequence
 * is paused, never silently advanced as if the send succeeded, and the lead is flagged for
 * manual attention.
 */
export async function markSendFailed(leadId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) return;

  if (
    lead.status === 'in_sequence' ||
    lead.status === 'categorized' ||
    lead.status === 'deck_generated'
  ) {
    await updateLeadStatus(leadId, 'needs_review', 'email_send_failed');
  }
}
