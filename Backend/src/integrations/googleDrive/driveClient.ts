import { readFile } from 'node:fs/promises';
import { google, type drive_v3 } from 'googleapis';
import { env } from '../../config/env.js';
import { DriveApiError, DriveAuthError, DrivePermissionError } from './errors.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export const GOOGLE_MIME = {
  FOLDER: 'application/vnd.google-apps.folder',
  DOC: 'application/vnd.google-apps.document',
  SHEET: 'application/vnd.google-apps.spreadsheet',
} as const;

/** Native Google file types are exported to one of our 4 supported formats before parsing. */
const EXPORT_MIME_TARGET: Record<string, { mimeType: string; extension: string }> = {
  [GOOGLE_MIME.DOC]: { mimeType: 'application/pdf', extension: 'pdf' },
  [GOOGLE_MIME.SHEET]: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
};

/** Directly-downloadable mime types we know how to parse. Anything else is skipped and logged. */
const SUPPORTED_BINARY_MIME_TO_EXT: Record<string, string> = {
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

let authClient: InstanceType<typeof google.auth.GoogleAuth> | null = null;
let driveClient: drive_v3.Drive | null = null;

function getAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (authClient) return authClient;

  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && !env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    throw new DriveAuthError(
      'No Google service account credentials configured (GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY_JSON)',
      null,
    );
  }

  authClient = env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
    ? new google.auth.GoogleAuth({
        keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        scopes: DRIVE_SCOPES,
      })
    : new google.auth.GoogleAuth({
        credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON as string),
        scopes: DRIVE_SCOPES,
      });

  return authClient;
}

function getDrive(): drive_v3.Drive {
  if (driveClient) return driveClient;
  // googleapis' own types are overly narrow here (GoogleAuth<JSONClient> vs. the
  // GoogleAuth<AuthClient> `new google.auth.GoogleAuth()` actually returns) — functionally
  // identical at runtime; this is a known upstream typing gap, not a real type mismatch.
  driveClient = google.drive({ version: 'v3', auth: getAuth() as never });
  return driveClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHttpStatus(err: unknown): number | undefined {
  const anyErr = err as { code?: number; status?: number; response?: { status?: number } };
  return anyErr?.response?.status ?? anyErr?.code ?? anyErr?.status;
}

/**
 * Wraps every Drive API call: retries transient failures (429/5xx) with exponential backoff,
 * and turns permission/auth failures into typed errors the caller can react to differently
 * (skip-and-continue vs. fail-the-whole-job). Never lets a raw googleapis error propagate
 * silently — every failure is classified and re-thrown with context.
 */
async function withDriveRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = 4,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = extractHttpStatus(err);

      if (status === 401) {
        throw new DriveAuthError(
          `Google Drive authentication failed during ${context} — service account credentials may be invalid or revoked`,
          err,
        );
      }
      if (status === 403) {
        throw new DrivePermissionError(
          `Permission denied during ${context} — the service account likely isn't shared on this file/folder`,
          err,
        );
      }

      attempt += 1;
      const retryable = status === 429 || (status !== undefined && status >= 500 && status < 600);
      if (!retryable || attempt > maxRetries) {
        throw new DriveApiError(
          `Google Drive API error during ${context}: ${(err as Error)?.message ?? err}`,
          err,
        );
      }

      const delayMs = Math.min(1000 * 2 ** attempt, 15_000);
      await sleep(delayMs);
    }
  }
}

/**
 * Accepts any Drive share-link format (folder, file, Docs/Sheets edit links) or a bare ID, and
 * returns the file/folder ID. Does not distinguish file vs. folder — call getFileMeta() for that.
 */
export function extractDriveIdFromUrl(input: string): string {
  const trimmed = input.trim();

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  // Not a URL we recognize — assume the caller passed a bare Drive ID.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  throw new Error(`Could not extract a Google Drive file/folder ID from: ${input}`);
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta> {
  const res = await withDriveRetry(
    () => getDrive().files.get({ fileId, fields: 'id, name, mimeType, size' }),
    `getFileMeta(${fileId})`,
  );
  return res.data as DriveFileMeta;
}

/** Lists direct children of a folder (one level — recursion is the caller's job, see driveIngestion.ts). */
export async function listFolderChildren(folderId: string): Promise<DriveFileMeta[]> {
  const children: DriveFileMeta[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withDriveRetry(
      () =>
        getDrive().files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, size)',
          pageSize: 200,
          pageToken,
        }),
      `listFolderChildren(${folderId})`,
    );
    children.push(...((res.data.files as DriveFileMeta[]) ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return children;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Downloads a directly-downloadable (non-Google-native) file's raw bytes. */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const res = await withDriveRetry(
    () => getDrive().files.get({ fileId, alt: 'media' }, { responseType: 'stream' }),
    `downloadFile(${fileId})`,
  );
  return streamToBuffer(res.data as unknown as NodeJS.ReadableStream);
}

/** Exports a native Google Doc/Sheet to PDF/XLSX respectively, per the ingestion requirement. */
export async function exportGoogleNativeFile(
  fileId: string,
  sourceMimeType: string,
): Promise<{ data: Buffer; extension: string } | null> {
  const target = EXPORT_MIME_TARGET[sourceMimeType];
  if (!target) return null;

  const res = await withDriveRetry(
    () =>
      getDrive().files.export({ fileId, mimeType: target.mimeType }, { responseType: 'stream' }),
    `exportGoogleNativeFile(${fileId}, ${sourceMimeType})`,
  );
  const data = await streamToBuffer(res.data as unknown as NodeJS.ReadableStream);
  return { data, extension: target.extension };
}

export function isFolder(mimeType: string): boolean {
  return mimeType === GOOGLE_MIME.FOLDER;
}

export function isGoogleNativeExportable(mimeType: string): boolean {
  return mimeType in EXPORT_MIME_TARGET;
}

export function supportedBinaryExtension(mimeType: string): string | null {
  return SUPPORTED_BINARY_MIME_TO_EXT[mimeType] ?? null;
}

/** Fails fast with a clear message if the configured service account key file/JSON is unreadable/malformed. */
export async function assertDriveCredentialsLoadable(): Promise<void> {
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    await readFile(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf-8');
  } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
  } else {
    throw new DriveAuthError('No Google service account credentials configured', null);
  }
}
