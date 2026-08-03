import type { AIProvider } from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

let cachedProvider: AIProvider | null = null;

/**
 * Single point of provider selection, driven entirely by AI_PROVIDER in .env. Mirrors
 * providers/email/index.ts — consumers depend only on the AIProvider interface.
 */
export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  switch (env.AI_PROVIDER) {
    case 'gemini':
      cachedProvider = new GeminiProvider();
      break;
    case 'openai':
      cachedProvider = new OpenAIProvider();
      break;
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.AI_PROVIDER}`);
  }

  return cachedProvider;
}

export type { AIProvider } from '@bebeyond/shared';
