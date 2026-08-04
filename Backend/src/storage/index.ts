import type { StorageProvider } from './StorageProvider.js';
import { env } from '../config/env.js';
import { LocalDiskStorageProvider } from './LocalDiskStorageProvider.js';
import { R2StorageProvider } from './R2StorageProvider.js';

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  switch (env.STORAGE_PROVIDER) {
    case 'r2':
      cached = new R2StorageProvider();
      break;
    case 'local':
      cached = new LocalDiskStorageProvider();
      break;
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${env.STORAGE_PROVIDER}`);
  }

  return cached;
}

export type { StorageProvider } from './StorageProvider.js';
