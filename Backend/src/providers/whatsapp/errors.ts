/** Thrown when a required WhatsApp Cloud API credential/config is missing — checked at point of use (provider method call), not at boot, mirroring AIConfigError/GmailNotImplementedError. */
export class WhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppConfigError';
  }
}

/**
 * Thrown by sendFreeformMessage when the lead's 24h session window (since their last inbound
 * message) has expired or never opened. Meta only allows freeform text inside that window —
 * outside it, only pre-approved template messages are permitted. Callers must not catch this to
 * silently fall back to a template send; that's a deliberate choice the caller/UI should make.
 */
export class WhatsAppFreeformWindowExpiredError extends Error {
  constructor(lastInboundAt: Date | null) {
    super(
      lastInboundAt
        ? `WhatsApp freeform send blocked: 24h session window closed (last inbound message was ${lastInboundAt.toISOString()}) — use a template message instead`
        : 'WhatsApp freeform send blocked: no inbound message on record for this lead (24h window never opened) — use a template message instead',
    );
    this.name = 'WhatsAppFreeformWindowExpiredError';
  }
}

/** Thrown when a lead is not opted in for WhatsApp — the hard compliance invariant. See Backend/src/modules/whatsapp/whatsappService.ts. */
export class WhatsAppNotOptedInError extends Error {
  constructor(leadId: string) {
    super(`Cannot send WhatsApp message to lead ${leadId}: not opted in (whatsapp_opted_in is false)`);
    this.name = 'WhatsAppNotOptedInError';
  }
}

/** Thrown when a lead has no WhatsApp number on record to send to. */
export class WhatsAppNoNumberError extends Error {
  constructor(leadId: string) {
    super(`Cannot send WhatsApp message to lead ${leadId}: no whatsapp_number on record`);
    this.name = 'WhatsAppNoNumberError';
  }
}
