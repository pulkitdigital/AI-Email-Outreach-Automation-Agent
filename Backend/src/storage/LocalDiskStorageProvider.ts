import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_STORAGE_DIR } from '../config/paths.js';
import type { StorageProvider } from './StorageProvider.js';

/** Dev/test fallback when R2 credentials aren't configured. Keys map directly to file paths. */
export class LocalDiskStorageProvider implements StorageProvider {
  private resolvePath(key: string): string {
    const safeKey = key.replace(/^\/+/, '');
    return path.join(LOCAL_STORAGE_DIR, safeKey);
  }

  async putObject(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolvePath(key), { force: true });
  }
}
