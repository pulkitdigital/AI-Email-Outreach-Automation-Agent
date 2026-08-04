import type { CategorizationMethod } from '@bebeyond/shared';
import { pool } from '../pool.js';

export interface SecondaryCategoryInput {
  categoryId: string;
  confidence: number;
  method: CategorizationMethod;
}

/**
 * Replaces the full set of secondary categories for a lead in one transaction — simpler and
 * safer than diffing, and categorization always recomputes the complete picture anyway (never
 * incrementally adds one category at a time).
 */
export async function replaceSecondaryCategories(
  leadId: string,
  matches: SecondaryCategoryInput[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lead_secondary_categories WHERE lead_id = $1', [leadId]);

    for (const match of matches) {
      await client.query(
        `INSERT INTO lead_secondary_categories (lead_id, category_id, confidence, method)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lead_id, category_id) DO NOTHING`,
        [leadId, match.categoryId, match.confidence, match.method],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface SecondaryCategoryRecord extends SecondaryCategoryInput {
  id: string;
}

export async function listSecondaryCategories(leadId: string): Promise<SecondaryCategoryRecord[]> {
  const { rows } = await pool.query(
    `SELECT id, category_id AS "categoryId", confidence::float AS confidence, method
     FROM lead_secondary_categories
     WHERE lead_id = $1`,
    [leadId],
  );
  return rows as SecondaryCategoryRecord[];
}
