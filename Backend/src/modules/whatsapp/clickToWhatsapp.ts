import { env } from '../../config/env.js';

/**
 * Generates a click-to-WhatsApp link (wa.me) pre-filled with a message referencing the lead's
 * company name, so an inbound message is self-identifying at a glance — the phone-suffix match
 * fallback in whatsappWebhookService.ts still runs regardless of what the prefilled text says.
 *
 * Returns null when WHATSAPP_CTA_ENABLED is false (default) or WHATSAPP_BUSINESS_NUMBER isn't
 * configured — callers (email footer, deck template) must treat null as "don't render the CTA",
 * never fall back to a broken/unconfigured URL. Gated behind WHATSAPP_CTA_ENABLED specifically
 * because this depends on Meta Business verification being complete before going live — see
 * shared/src/types/whatsapp.ts and Docs/ARCHITECTURE.md.
 */
export function buildClickToWhatsAppLink(companyName: string | null): string | null {
  if (!env.WHATSAPP_CTA_ENABLED) return null;
  if (!env.WHATSAPP_BUSINESS_NUMBER) return null;

  const greeting = companyName
    ? `Hi, this is ${companyName} — we'd like to chat about your outreach services.`
    : "Hi, we'd like to chat about your outreach services.";

  const url = new URL(`https://wa.me/${env.WHATSAPP_BUSINESS_NUMBER}`);
  url.searchParams.set('text', greeting);
  return url.toString();
}
