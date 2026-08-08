import { getAllPitchDecksForLead } from '../../db/repositories/pitchDecksRepository.js';
import { hardDeleteLead, type LeadRecord } from '../../db/repositories/leadsRepository.js';
import { getStorageProvider } from '../../storage/index.js';

/**
 * Deletes every R2-stored file (pptx + pdf) across all of a lead's pitch_decks rows, then
 * hard-deletes the lead itself — DB cascade (see leadsRepository.hardDeleteLead's docstring)
 * removes the pitch_decks rows and everything else that references the lead in the same
 * statement. File deletion happens first and must complete (or fail loudly in the log) before
 * the DB row disappears, since file_key/pdf_file_key are only readable via the pitch_decks rows
 * this is about to cascade away.
 *
 * Each individual R2 delete is best-effort: a failure is logged with enough detail to find and
 * clean up the orphaned object by hand, but never blocks the lead/DB delete — a lead stuck
 * non-deletable because of one flaky storage call is a worse outcome than one leftover file.
 *
 * Assumes the caller (routes/leads.ts) already confirmed the lead exists — returns null (like
 * hardDeleteLead) if it was deleted out from under this call, rather than throwing.
 */
export async function deleteLead(id: string): Promise<LeadRecord | null> {
  const decks = await getAllPitchDecksForLead(id);
  const keys = decks
    .flatMap((deck) => [deck.fileKey, deck.pdfFileKey])
    .filter((key): key is string => key !== null);

  const storage = getStorageProvider();
  await Promise.all(
    keys.map(async (key) => {
      try {
        await storage.deleteObject(key);
      } catch (err) {
        console.error(`[lead-deletion] failed to delete R2 object '${key}' for lead ${id}:`, err);
      }
    }),
  );

  return hardDeleteLead(id);
}
