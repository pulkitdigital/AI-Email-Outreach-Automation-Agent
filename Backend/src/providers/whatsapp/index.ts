import type { WhatsAppProvider } from '@bebeyond/shared';
import { MetaCloudWhatsAppProvider } from './MetaCloudWhatsAppProvider.js';

let cachedProvider: WhatsAppProvider | null = null;

/**
 * Single point of provider selection — mirrors providers/email/index.ts's getEmailProvider().
 * Meta Cloud is the only implementation today; everything else in the codebase must depend on
 * the WhatsAppProvider interface only, never MetaCloudWhatsAppProvider directly, so a future
 * second provider (or a WHATSAPP_PROVIDER env switch) is a config change, not a code change.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (!cachedProvider) {
    cachedProvider = new MetaCloudWhatsAppProvider();
  }
  return cachedProvider;
}

export type { WhatsAppProvider } from '@bebeyond/shared';
