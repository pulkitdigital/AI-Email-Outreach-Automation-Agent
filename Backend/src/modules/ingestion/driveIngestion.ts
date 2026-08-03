import {
  appendIngestionJobError,
  incrementIngestionJobCounters,
  markIngestionJobStarted,
} from '../../db/repositories/ingestionJobsRepository.js';
import {
  downloadFile,
  exportGoogleNativeFile,
  extractDriveIdFromUrl,
  getFileMeta,
  isFolder,
  isGoogleNativeExportable,
  listFolderChildren,
  supportedBinaryExtension,
  type DriveFileMeta,
} from '../../integrations/googleDrive/driveClient.js';
import { DrivePermissionError } from '../../integrations/googleDrive/errors.js';
import { expandToLeafFiles, processLeafFile } from './pipeline.js';

/** Generous but bounded — real Drive folder trees rarely nest this deep; guards against cycles/pathological structures. */
const MAX_DRIVE_RECURSION_DEPTH = 15;

interface DiscoveredDriveFile {
  id: string;
  name: string;
  mimeType: string;
  pathLabel: string;
}

/**
 * Recursively lists every file under the given Drive root (a single file, or a folder —
 * recursing into nested subfolders). A subfolder the service account isn't shared on is logged
 * and skipped (DrivePermissionError); anything else (expired/invalid credentials, exhausted
 * retries on rate limits) propagates and fails the whole job — retrying file-by-file wouldn't
 * help since the same auth/API problem would hit every subsequent call.
 */
async function discoverDriveFiles(rootId: string, jobId: string): Promise<DiscoveredDriveFile[]> {
  const discovered: DiscoveredDriveFile[] = [];

  async function walk(folderId: string, pathLabel: string, depth: number): Promise<void> {
    if (depth > MAX_DRIVE_RECURSION_DEPTH) {
      await appendIngestionJobError(jobId, {
        file: pathLabel,
        message: `Exceeded max Drive folder recursion depth (${MAX_DRIVE_RECURSION_DEPTH}) — skipped`,
      });
      return;
    }

    let children: DriveFileMeta[];
    try {
      children = await listFolderChildren(folderId);
    } catch (err) {
      if (err instanceof DrivePermissionError) {
        await appendIngestionJobError(jobId, { file: pathLabel, message: err.message });
        return;
      }
      throw err;
    }

    for (const child of children) {
      const childLabel = `${pathLabel}/${child.name}`;
      if (isFolder(child.mimeType)) {
        await walk(child.id, childLabel, depth + 1);
      } else {
        discovered.push({
          id: child.id,
          name: child.name,
          mimeType: child.mimeType,
          pathLabel: childLabel,
        });
      }
    }
  }

  const rootMeta = await getFileMeta(rootId);
  if (isFolder(rootMeta.mimeType)) {
    await walk(rootId, 'drive', 0);
  } else {
    discovered.push({
      id: rootMeta.id,
      name: rootMeta.name,
      mimeType: rootMeta.mimeType,
      pathLabel: `drive/${rootMeta.name}`,
    });
  }

  return discovered;
}

/**
 * Downloads a discovered file's bytes, exporting native Google Docs/Sheets to PDF/XLSX first
 * (per the ingestion requirement). Returns null for unsupported types or per-file permission
 * errors — both are logged, neither is fatal to the job.
 */
async function materializeDriveFile(
  jobId: string,
  file: DiscoveredDriveFile,
): Promise<{ path: string; buffer: Buffer } | null> {
  try {
    if (isGoogleNativeExportable(file.mimeType)) {
      const exported = await exportGoogleNativeFile(file.id, file.mimeType);
      if (!exported) return null;
      return { path: `${file.pathLabel}.${exported.extension}`, buffer: exported.data };
    }

    const ext = supportedBinaryExtension(file.mimeType);
    if (!ext) {
      await appendIngestionJobError(jobId, {
        file: file.pathLabel,
        message: `Unsupported Drive file type (${file.mimeType}) — skipped`,
      });
      return null;
    }

    const data = await downloadFile(file.id);
    return { path: file.pathLabel, buffer: data };
  } catch (err) {
    if (err instanceof DrivePermissionError) {
      await appendIngestionJobError(jobId, { file: file.pathLabel, message: err.message });
      return null;
    }
    throw err;
  }
}

/**
 * Runs a full Drive ingestion job: discover -> mark started with the known file count -> for
 * each file, download/export, expand if it's a zip, and process every resulting leaf. Progress
 * (ingestion_jobs.files_processed / total_files_discovered) is updated incrementally per file
 * so a caller polling GET /api/ingestion/jobs/:id sees real progress, not just a final result.
 */
export async function runDriveIngestionJob(jobId: string, driveUrl: string): Promise<void> {
  const rootId = extractDriveIdFromUrl(driveUrl);
  const discovered = await discoverDriveFiles(rootId, jobId);

  await markIngestionJobStarted(jobId, discovered.length);

  for (const file of discovered) {
    const materialized = await materializeDriveFile(jobId, file);
    if (!materialized) {
      await incrementIngestionJobCounters(jobId, { filesProcessed: 1 });
      continue;
    }

    const { files: expanded, warnings } = expandToLeafFiles(materialized.path, materialized.buffer);
    for (const warning of warnings) {
      console.warn(`[ingestion] job=${jobId} ${warning}`);
    }

    if (expanded.length > 1) {
      // materialized was a zip that expanded into multiple leaves — grow the discovered total
      // so progress stays meaningful instead of finishing above 100%.
      await incrementIngestionJobCounters(jobId, { totalFilesDiscovered: expanded.length - 1 });
    }

    for (const leaf of expanded) {
      await processLeafFile(jobId, leaf.path, leaf.buffer);
    }
  }
}
