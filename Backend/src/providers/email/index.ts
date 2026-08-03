import type { EmailProvider } from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { BrevoProvider } from './BrevoProvider.js';
import { GmailProvider } from './GmailProvider.js';

let cachedProvider: EmailProvider | null = null;

/**
 * Single point of provider selection, driven entirely by EMAIL_PROVIDER in .env. Everything
 * else in the codebase must depend on the EmailProvider interface returned here — never import
 * BrevoProvider/GmailProvider directly. See Docs/ARCHITECTURE.md § 5.
 */
export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;

  switch (env.EMAIL_PROVIDER) {
    case 'brevo':
      cachedProvider = new BrevoProvider();
      break;
    case 'gmail':
      cachedProvider = new GmailProvider();
      break;
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
  }

  return cachedProvider;
}

/**
 * Call this eagerly at process startup (both the API server and the worker process — see
 * index.ts and queue/startWorkers.ts) so a misconfigured EMAIL_PROVIDER (e.g. 'gmail' before
 * it's wired up) fails loudly at boot, not buried deep in a queue job's error log the first
 * time something tries to send.
 */
export function assertEmailProviderReady(): void {
  getEmailProvider();
}

export type { EmailProvider } from '@bebeyond/shared';
