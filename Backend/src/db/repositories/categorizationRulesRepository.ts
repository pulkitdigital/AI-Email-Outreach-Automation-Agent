import type { CategorizationRule } from '@bebeyond/shared';
import { pool } from '../pool.js';

export async function listActiveCategorizationRules(): Promise<CategorizationRule[]> {
  const { rows } = await pool.query(
    `SELECT
       id, category_id AS "categoryId", match_field AS "matchField",
       match_type AS "matchType", pattern, weight::float AS weight, is_active AS "isActive"
     FROM categorization_rules
     WHERE is_active = true`,
  );
  return rows as CategorizationRule[];
}
