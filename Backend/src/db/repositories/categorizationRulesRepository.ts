import type {
  CategorizationRule,
  CategorizationRuleMatchField,
  CategorizationRuleMatchType,
} from '@bebeyond/shared';
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

export interface CreateCategorizationRuleInput {
  categoryId: string;
  matchField: CategorizationRuleMatchField;
  matchType: CategorizationRuleMatchType;
  pattern: string;
  weight: number;
}

/** Bulk-inserts the starter rule set proposed alongside a manually-created category (Phase 6 dashboard). */
export async function createCategorizationRules(
  inputs: CreateCategorizationRuleInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const values: unknown[] = [];
  const placeholders = inputs.map((r, i) => {
    const base = i * 5;
    values.push(r.categoryId, r.matchField, r.matchType, r.pattern, r.weight);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await pool.query(
    `INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}
