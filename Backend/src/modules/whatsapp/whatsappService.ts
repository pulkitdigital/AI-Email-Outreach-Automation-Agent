import {
  getLeadWhatsAppState,
  logWhatsAppMessage,
  type LeadWhatsAppState,
} from '../../db/repositories/whatsappRepository.js';
import { getWhatsAppProvider } from '../../providers/whatsapp/index.js';
import { WhatsAppNoNumberError, WhatsAppNotOptedInError } from '../../providers/whatsapp/errors.js';

/**
 * The ONLY sanctioned way to send a WhatsApp message anywhere in this codebase — every caller
 * (dashboard route today; a future queue worker, if this is ever wired into the scheduler) must
 * go through sendWhatsAppTemplateMessage/sendWhatsAppFreeformMessage below, never
 * getWhatsAppProvider() directly. That's what makes the opt-in check below a hard invariant
 * instead of a convention: it lives at this single choke point, not duplicated (and possibly
 * forgotten) at every call site.
 */

interface OptedInLeadWhatsAppState extends LeadWhatsAppState {
  whatsappNumber: string;
}

/**
 * Re-reads whatsapp_opted_in directly from the DB — never from a lead object the caller loaded
 * earlier in the request — and aborts with a clear, typed error if it's false. This is the
 * compliance hard invariant (Meta's WhatsApp Business Policy prohibits cold outbound messaging):
 * every send path below calls this immediately before touching the provider, so no future code
 * path can accidentally send without it running.
 */
async function assertOptedIn(leadId: string): Promise<OptedInLeadWhatsAppState> {
  const state = await getLeadWhatsAppState(leadId);
  if (!state) {
    throw new Error(`Cannot send WhatsApp message: lead not found (${leadId})`);
  }
  if (!state.whatsappOptedIn) {
    throw new WhatsAppNotOptedInError(leadId);
  }
  if (!state.whatsappNumber) {
    throw new WhatsAppNoNumberError(leadId);
  }
  return state as OptedInLeadWhatsAppState;
}

/** Sendable any time (template messages aren't subject to the 24h window) — still gated by the opt-in check above. */
export async function sendWhatsAppTemplateMessage(
  leadId: string,
  templateName: string,
  language: string,
  variables: Record<string, string> = {},
): Promise<void> {
  const state = await assertOptedIn(leadId);

  try {
    const result = await getWhatsAppProvider().sendTemplateMessage({
      to: state.whatsappNumber,
      templateName,
      language,
      variables,
      internalReferenceId: leadId,
    });
    await logWhatsAppMessage({
      leadId,
      direction: 'outbound',
      messageType: 'template',
      templateName,
      bodyPreview: Object.keys(variables).length > 0 ? JSON.stringify(variables) : null,
      metaMessageId: result.externalMessageId,
      status: 'sent',
    });
  } catch (err) {
    await logWhatsAppMessage({
      leadId,
      direction: 'outbound',
      messageType: 'template',
      templateName,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Only sendable within the 24h window since the lead's last inbound message — the provider itself enforces this from state.whatsappLastInboundAt (see MetaCloudWhatsAppProvider.sendFreeformMessage), read fresh here alongside the opt-in check. */
export async function sendWhatsAppFreeformMessage(leadId: string, body: string): Promise<void> {
  const state = await assertOptedIn(leadId);

  try {
    const result = await getWhatsAppProvider().sendFreeformMessage({
      to: state.whatsappNumber,
      body,
      lastInboundAt: state.whatsappLastInboundAt,
      internalReferenceId: leadId,
    });
    await logWhatsAppMessage({
      leadId,
      direction: 'outbound',
      messageType: 'freeform',
      bodyPreview: body.slice(0, 500),
      metaMessageId: result.externalMessageId,
      status: 'sent',
    });
  } catch (err) {
    await logWhatsAppMessage({
      leadId,
      direction: 'outbound',
      messageType: 'freeform',
      bodyPreview: body.slice(0, 500),
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
