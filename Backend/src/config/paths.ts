import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Backend/src/config -> backend/ */
export const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

export const TMP_DIR = path.join(BACKEND_ROOT, 'tmp');
/** Backing directory for LocalDiskStorageProvider (dev/test fallback for the R2 abstraction). */
export const LOCAL_STORAGE_DIR = path.join(TMP_DIR, 'storage');
/** Scratch space for zip extraction / Drive downloads while a job is processing; cleaned up per-job. */
export const WORK_DIR = path.join(TMP_DIR, 'work');
