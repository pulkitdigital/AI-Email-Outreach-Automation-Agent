import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { WORK_DIR } from '../../config/paths.js';
import { DeckPdfConversionError } from './errors.js';

const execFileAsync = promisify(execFile);

const CONVERSION_TIMEOUT_MS = 60_000;

/**
 * soffice.exe/soffice location resolution, in order:
 *  1. LIBREOFFICE_PATH env var, if set — explicit override for unusual install locations, and
 *     the intended path forward for Render/Linux deployment (installing LibreOffice into a
 *     container image, then pointing this at it) since none of the fallback paths below apply
 *     off Windows/macOS.
 *  2. `soffice`/`soffice.exe` on PATH — covers a standard Linux package-manager install
 *     (apt/dnf `libreoffice`) and any Windows install that added itself to PATH.
 *  3. Known default install locations per platform. No prior convention for this existed
 *     anywhere else in this codebase (checked) — this list is new, not carried over from
 *     elsewhere; Windows entries are exactly the paths the user asked to be checked, macOS/Linux
 *     entries added for completeness since Backend deploys to Render (Linux) in production.
 */
function candidatePaths(): string[] {
  const fromEnv = process.env.LIBREOFFICE_PATH;
  const byPlatform: string[] =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
          'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
          path.join(
            process.env.LOCALAPPDATA ?? '',
            'Programs',
            'LibreOffice',
            'program',
            'soffice.exe',
          ),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
        : [
            '/usr/bin/soffice',
            '/usr/lib/libreoffice/program/soffice',
            '/opt/libreoffice/program/soffice',
          ];

  const command = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
  return [...(fromEnv ? [fromEnv] : []), command, ...byPlatform];
}

async function resolveSofficeBinary(): Promise<string> {
  const candidates = candidatePaths();

  // The bare `soffice`/`soffice.exe` command (PATH lookup) can't be access()-checked as a file
  // path — try executing `--version` on each candidate in order and use the first that succeeds.
  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate)) {
        await access(candidate);
      }
      await execFileAsync(candidate, ['--version'], { timeout: 10_000 });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new DeckPdfConversionError(
    `LibreOffice (soffice) was not found — checked LIBREOFFICE_PATH, PATH, and the standard ` +
      `install locations for ${process.platform} (${candidates.join(', ')}). Install LibreOffice ` +
      `(https://www.libreoffice.org/download/download/) or set LIBREOFFICE_PATH to soffice's ` +
      `full path, then retry.`,
  );
}

/**
 * Converts a built .pptx buffer to .pdf via LibreOffice headless (`soffice --headless
 * --convert-to pdf`), shelling out rather than using a Node wrapper library since none of the
 * project's existing dependencies (pptxgenjs, adm-zip, exceljs, csv-parse, pdf-parse) do
 * pptx->pdf conversion, and no such wrapper is already a dependency — soffice is the actual
 * conversion engine either way, so a wrapper would only add an indirection layer, not remove
 * the LibreOffice dependency itself.
 *
 * Each call gets its own scratch subdirectory under WORK_DIR (named by a fresh UUID, not the
 * pitchDeckId) so concurrent conversions (deckGenerationWorker's concurrency: 2) can never
 * collide on the same input/output filenames — always cleaned up in a `finally`, success or
 * failure.
 */
export async function convertPptxToPdf(pptxBuffer: Buffer): Promise<Buffer> {
  const soffice = await resolveSofficeBinary();

  const jobDir = path.join(WORK_DIR, `pptx-to-pdf-${randomUUID()}`);
  const inputPath = path.join(jobDir, 'deck.pptx');
  const outputPath = path.join(jobDir, 'deck.pdf');

  await mkdir(jobDir, { recursive: true });
  try {
    await writeFile(inputPath, pptxBuffer);

    try {
      await execFileAsync(
        soffice,
        ['--headless', '--convert-to', 'pdf', '--outdir', jobDir, inputPath],
        { timeout: CONVERSION_TIMEOUT_MS },
      );
    } catch (err) {
      const isTimeout = (err as { killed?: boolean; signal?: string }).signal === 'SIGTERM';
      throw new DeckPdfConversionError(
        isTimeout
          ? `LibreOffice conversion timed out after ${CONVERSION_TIMEOUT_MS}ms`
          : `LibreOffice conversion failed: ${(err as Error).message}`,
      );
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await readFile(outputPath);
    } catch {
      throw new DeckPdfConversionError(
        'LibreOffice reported success but produced no output .pdf file — treating as a conversion failure',
      );
    }

    if (pdfBuffer.length === 0 || pdfBuffer.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw new DeckPdfConversionError(
        `LibreOffice produced an invalid .pdf (${pdfBuffer.length} bytes, missing %PDF header) — ` +
          `treating input as corrupt or the conversion as failed`,
      );
    }

    return pdfBuffer;
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}
