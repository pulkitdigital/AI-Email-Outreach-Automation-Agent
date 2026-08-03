/**
 * Minimal object storage contract, mirroring the EmailProvider/AIProvider pattern
 * (see Docs/ARCHITECTURE.md). Kept deliberately small — this project only ever needs
 * put/get/delete by key.
 *
 * Two implementations:
 *  - R2StorageProvider: Cloudflare R2 (production target, per tech stack).
 *  - LocalDiskStorageProvider: dev/test fallback so ingestion can be exercised without R2
 *    credentials configured. Selected via STORAGE_PROVIDER=local|r2 in .env (defaults to
 *    'local' for zero-friction local development; Railway deployment should set 'r2').
 */
export interface StorageProvider {
  putObject(key: string, data: Buffer, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
