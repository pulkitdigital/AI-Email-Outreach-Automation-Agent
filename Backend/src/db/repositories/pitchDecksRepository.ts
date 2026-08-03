import type { PitchDeckGenerationStatus } from '@bebeyond/shared';
import { pool } from '../pool.js';

export interface PitchDeckRecord {
  id: string;
  leadId: string;
  categoryId: string | null;
  generationStatus: PitchDeckGenerationStatus;
  generationError: string | null;
  generatedBy: string | null;
  templateVersion: string | null;
  fileKey: string | null;
  fileUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PITCH_DECK_COLUMNS = `
  id, lead_id AS "leadId", category_id AS "categoryId",
  generation_status AS "generationStatus", generation_error AS "generationError",
  generated_by AS "generatedBy", template_version AS "templateVersion",
  file_key AS "fileKey", file_url AS "fileUrl",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export interface CreatePitchDeckInput {
  leadId: string;
  categoryId: string | null;
  templateVersion: string;
}

export async function createPitchDeck(input: CreatePitchDeckInput): Promise<PitchDeckRecord> {
  const { rows } = await pool.query(
    `INSERT INTO pitch_decks (lead_id, category_id, template_version)
     VALUES ($1, $2, $3)
     RETURNING ${PITCH_DECK_COLUMNS}`,
    [input.leadId, input.categoryId, input.templateVersion],
  );
  return rows[0] as PitchDeckRecord;
}

export async function getPitchDeckById(id: string): Promise<PitchDeckRecord | null> {
  const { rows } = await pool.query(`SELECT ${PITCH_DECK_COLUMNS} FROM pitch_decks WHERE id = $1`, [
    id,
  ]);
  return (rows[0] as PitchDeckRecord | undefined) ?? null;
}

export interface FailedPitchDeckItem extends PitchDeckRecord {
  leadEmail: string;
  companyName: string | null;
}

export interface ListFailedPitchDecksResult {
  decks: FailedPitchDeckItem[];
  total: number;
}

/**
 * The dashboard's System Status view (Phase 6) — most recent deck generation failures, for a
 * one-stop "what needs attention" list. Explicit `p.`-qualified columns since `leads` (joined)
 * also has its own `id`/`created_at`/`updated_at` — see the same fix in leadsRepository.ts /
 * sentEmailsLogRepository.ts / repliesRepository.ts for why bare column names are unsafe here.
 */
export async function listFailedPitchDecks(limit: number): Promise<ListFailedPitchDecksResult> {
  const { rows } = await pool.query(
    `SELECT p.id, p.lead_id AS "leadId", p.category_id AS "categoryId",
            p.generation_status AS "generationStatus", p.generation_error AS "generationError",
            p.generated_by AS "generatedBy", p.template_version AS "templateVersion",
            p.file_key AS "fileKey", p.file_url AS "fileUrl",
            p.created_at AS "createdAt", p.updated_at AS "updatedAt",
            l.email AS "leadEmail", l.company_name AS "companyName",
            COUNT(*) OVER()::text AS "totalCount"
     FROM pitch_decks p
     JOIN leads l ON l.id = p.lead_id
     WHERE p.generation_status = 'failed'
     ORDER BY p.updated_at DESC
     LIMIT $1`,
    [limit],
  );

  const total = rows.length > 0 ? Number((rows[0] as { totalCount: string }).totalCount) : 0;
  const decks = rows.map((row) => {
    const { totalCount: _totalCount, ...deck } = row as FailedPitchDeckItem & {
      totalCount: string;
    };
    return deck;
  });

  return { decks, total };
}

export async function getLatestPitchDeckForLead(leadId: string): Promise<PitchDeckRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${PITCH_DECK_COLUMNS} FROM pitch_decks WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadId],
  );
  return (rows[0] as PitchDeckRecord | undefined) ?? null;
}

export interface UpdatePitchDeckStatusInput {
  status: PitchDeckGenerationStatus;
  generationError?: string | null;
  generatedBy?: string | null;
  fileKey?: string | null;
  fileUrl?: string | null;
}

export async function updatePitchDeckStatus(
  id: string,
  patch: UpdatePitchDeckStatusInput,
): Promise<PitchDeckRecord | null> {
  const { rows } = await pool.query(
    `UPDATE pitch_decks SET
       generation_status = $2,
       generation_error = $3,
       generated_by = COALESCE($4, generated_by),
       file_key = COALESCE($5, file_key),
       file_url = COALESCE($6, file_url)
     WHERE id = $1
     RETURNING ${PITCH_DECK_COLUMNS}`,
    [
      id,
      patch.status,
      patch.generationError ?? null,
      patch.generatedBy ?? null,
      patch.fileKey ?? null,
      patch.fileUrl ?? null,
    ],
  );
  return (rows[0] as PitchDeckRecord | undefined) ?? null;
}
