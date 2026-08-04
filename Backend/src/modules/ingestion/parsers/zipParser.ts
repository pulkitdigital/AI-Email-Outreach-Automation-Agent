import AdmZip from 'adm-zip';
import { env } from '../../../config/env.js';

export interface ExtractedZipFile {
  /** Full path within the archive, including any nested-zip prefixes, for traceability in logs. */
  path: string;
  buffer: Buffer;
}

export interface ZipExtractionResult {
  files: ExtractedZipFile[];
  warnings: string[];
}

/**
 * Recursively extracts a ZIP, descending into nested ZIPs up to ZIP_MAX_RECURSION_DEPTH
 * (default 5). A corrupt archive/entry is logged as a warning and skipped rather than
 * throwing — the rest of the batch must keep processing.
 */
export function extractZip(buffer: Buffer, rootName: string): ZipExtractionResult {
  const files: ExtractedZipFile[] = [];
  const warnings: string[] = [];
  const maxDepth = env.ZIP_MAX_RECURSION_DEPTH;

  function walk(zipBuffer: Buffer, pathPrefix: string, depth: number): void {
    if (depth > maxDepth) {
      warnings.push(`${pathPrefix}: exceeded max zip recursion depth (${maxDepth}) — skipped`);
      return;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch (err) {
      warnings.push(`${pathPrefix}: failed to open as zip: ${(err as Error).message}`);
      return;
    }

    let entries: AdmZip.IZipEntry[];
    try {
      entries = zip.getEntries();
    } catch (err) {
      warnings.push(`${pathPrefix}: failed to read zip entries: ${(err as Error).message}`);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const entryPath = `${pathPrefix}/${entry.entryName}`;
      let data: Buffer;
      try {
        data = entry.getData();
      } catch (err) {
        warnings.push(`${entryPath}: failed to extract entry: ${(err as Error).message}`);
        continue;
      }

      if (entry.entryName.toLowerCase().endsWith('.zip')) {
        walk(data, entryPath, depth + 1);
      } else {
        files.push({ path: entryPath, buffer: data });
      }
    }
  }

  walk(buffer, rootName, 0);
  return { files, warnings };
}
