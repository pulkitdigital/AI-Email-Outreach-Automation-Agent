import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import pdfParseImpl from 'pdf-parse';
import { WORK_DIR } from '../../config/paths.js';
import { DeckPdfConversionError } from './errors.js';

const execFileAsync = promisify(execFile);

const CONVERSION_TIMEOUT_MS = 60_000;

/**
 * A real 12-slide deck (this template's fixed size — see deckBuilder.ts) is text/vector-shape
 * heavy with no embedded raster images, so its PDF is small — a handful of KB per slide at most.
 * Anything under 5KB total almost certainly means LibreOffice produced a near-empty/blank
 * document (e.g. it silently failed to render content but still exited 0) rather than a real
 * rendering of 12 slides.
 */
const MIN_SANE_PDF_BYTES = 5_000;
/**
 * Not a hard cap — a deck this template produces should never get remotely close to this, so
 * crossing it more likely means something is duplicating content (e.g. a runaway loop) than that
 * it's a legitimately large-but-valid deck. Logged as a warning, not thrown: unlike "too small"
 * there's no plausible reading of "too large" as definitely corrupt, so it shouldn't block the
 * deck from reaching the lead.
 */
const SUSPICIOUSLY_LARGE_PDF_BYTES = 20 * 1024 * 1024;

/**
 * soffice.exe/soffice location resolution, in order:
 *  1. LIBREOFFICE_PATH env var, if set — explicit override for unusual install locations. Not
 *     required for the Render deployment (render.yaml's `apt-get install libreoffice-impress` in
 *     bebeyond-backend-worker's buildCommand puts `soffice` on PATH the standard Debian/Ubuntu
 *     way, so candidate #2 below already resolves it there) — kept as an override for any future
 *     deployment target that installs LibreOffice somewhere nonstandard.
 *  2. `soffice`/`soffice.exe` on PATH — covers a standard Linux package-manager install
 *     (apt/dnf `libreoffice`, incl. Render production — see render.yaml) and any Windows install
 *     that added itself to PATH.
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
 * pitchDeckId) so concurrent conversions can never collide on the same input/output filenames —
 * always cleaned up in a `finally`, success or failure. (deckGenerationWorker's concurrency is 1
 * as of the Render 512MB-memory audit — see its own comment — so in practice there's currently
 * never more than one of these running at once anyway; the UUID scratch dir is kept regardless
 * since it's what makes that safe if concurrency is ever raised again.)
 *
 * `expectedPageCount`, when provided, is checked against the actual page count of the produced
 * PDF (via pdf-parse, already a dependency — see package.json) as a stronger correctness check
 * than the pre-existing %PDF-header/non-empty check alone: a conversion that "succeeds" (exit 0,
 * valid PDF header) but silently drops slides — e.g. a corrupt/partial pptx, or a LibreOffice
 * bug — would otherwise sail through undetected and reach a lead as a truncated deck. Callers
 * that don't have a slide count handy (none currently) can omit it and get only the pre-existing
 * checks.
 */
export async function convertPptxToPdf(
  pptxBuffer: Buffer,
  expectedPageCount?: number,
): Promise<Buffer> {
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

    if (pdfBuffer.length < MIN_SANE_PDF_BYTES) {
      throw new DeckPdfConversionError(
        `LibreOffice produced a suspiciously small .pdf (${pdfBuffer.length} bytes, below the ` +
          `${MIN_SANE_PDF_BYTES}-byte sanity floor for a ${expectedPageCount ?? 'multi'}-slide ` +
          `deck) — treating as a failed/blank conversion rather than risking sending it`,
      );
    }
    if (pdfBuffer.length > SUSPICIOUSLY_LARGE_PDF_BYTES) {
      // Flagged, not failed — see the constant's own comment for why this one doesn't throw.
      console.warn(
        `[pptxToPdf] produced an unusually large .pdf (${pdfBuffer.length} bytes) for a deck ` +
          `this template normally renders small — allowing it through, but worth a look.`,
      );
    }

    // Page-count check — catches a conversion that silently dropped slides despite exiting 0 and
    // producing a structurally valid, plausibly-sized PDF (the checks above wouldn't catch that;
    // a truncated 3-page PDF can easily clear a 5KB floor). Only runs when the caller passed the
    // slide count it actually asked pptxgenjs to build (deckGenerationService.ts does); skipped
    // rather than failing closed when it's not available, matching this function's pre-existing
    // behavior of doing the checks it can with what it's given.
    if (expectedPageCount !== undefined) {
      let actualPageCount: number;
      try {
        actualPageCount = (await pdfParseImpl(pdfBuffer)).numpages;
      } catch (err) {
        throw new DeckPdfConversionError(
          `Produced a .pdf that pdf-parse couldn't read back (${(err as Error).message}) — ` +
            `treating as a failed conversion rather than trusting an unverifiable file`,
        );
      }

      if (actualPageCount !== expectedPageCount) {
        throw new DeckPdfConversionError(
          `LibreOffice produced a .pdf with ${actualPageCount} page(s), expected ` +
            `${expectedPageCount} (one per slide pptxgenjs built) — treating as a conversion ` +
            `failure rather than sending a lead a truncated or padded deck`,
        );
      }
    }

    return pdfBuffer;
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}
