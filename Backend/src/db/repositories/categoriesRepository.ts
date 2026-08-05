import type { ServiceGroup } from '@bebeyond/shared';
import { pool } from '../pool.js';

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  serviceGroup: ServiceGroup | null;
  /** Set when the category was created via the quota/rate-limit fallback (see classifyNewCategory / CategoryClassificationQuotaError) — needs a human to confirm/fix the service group and rules. */
  needsReview: boolean;
  reviewReason: string | null;
}

const CATEGORY_COLUMNS = `
  id, name, slug, service_group AS "serviceGroup",
  needs_review AS "needsReview", review_reason AS "reviewReason"
`;

export async function listActiveCategories(): Promise<CategoryRecord[]> {
  const { rows } = await pool.query(
    `SELECT ${CATEGORY_COLUMNS}
     FROM categories
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return rows as CategoryRecord[];
}

export async function getCategoryById(id: string): Promise<CategoryRecord | null> {
  const { rows } = await pool.query(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = $1`,
    [id],
  );
  return (rows[0] as CategoryRecord | undefined) ?? null;
}

export async function categorySlugExists(slug: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM categories WHERE slug = $1`, [slug]);
  return rows.length > 0;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  /** Nullable for the quota-fallback path — the AI classifier never ran, so there's no group to record until a human sets one. */
  serviceGroup: ServiceGroup | null;
  needsReview?: boolean;
  reviewReason?: string | null;
}

/** Manual category creation (Phase 6 dashboard) — categories created this way start active and criteria-less. */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryRecord> {
  const { rows } = await pool.query(
    `INSERT INTO categories (name, slug, service_group, needs_review, review_reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${CATEGORY_COLUMNS}`,
    [
      input.name,
      input.slug,
      input.serviceGroup,
      input.needsReview ?? false,
      input.reviewReason ?? null,
    ],
  );
  return rows[0] as CategoryRecord;
}
