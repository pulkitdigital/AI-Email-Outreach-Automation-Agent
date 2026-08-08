import type { ServiceGroup } from '@bebeyond/shared';
import { pool } from '../pool.js';

export type CategoryContentType = 'our_services' | 'how_can_we_help';

export interface CategoryContent {
  id: string;
  categoryId: string;
  contentType: CategoryContentType;
  displayName: string;
  accentColor: string | null;
  /** Populated for 'our_services' rows, null for 'how_can_we_help' rows. */
  services: string[] | null;
  /** Populated for 'how_can_we_help' rows, null for 'our_services' rows. */
  benefits: string[] | null;
  isAiGenerated: boolean;
  createdAt: Date;
}

/**
 * listAllCategoryContent's row shape — adds the owning category's own slug/service_group via a
 * JOIN. Deck generation (pdf/generateDeckPdf.ts) needs categorySlug to feed
 * orderCategoriesForLead()/orderBenefitsForLead(), which both match against a category slug, not
 * a category_content row id. getCategoryContent/createCategoryContent don't need this — their
 * callers already know the categoryId (and thus the slug) going in.
 */
export interface CategoryContentListItem extends CategoryContent {
  categorySlug: string;
  categoryServiceGroup: ServiceGroup | null;
}

const CATEGORY_CONTENT_COLUMNS = `
  id, category_id AS "categoryId", content_type AS "contentType", display_name AS "displayName",
  accent_color AS "accentColor", services, benefits, is_ai_generated AS "isAiGenerated",
  created_at AS "createdAt"
`;

/** Qualified for the join in listAllCategoryContent — categories has its own `id`, so the bare CATEGORY_CONTENT_COLUMNS constant would be ambiguous here (same reasoning as sentEmailsLogRepository.ts's LOG_LIST_COLUMNS). */
const CATEGORY_CONTENT_LIST_COLUMNS = `
  cc.id, cc.category_id AS "categoryId", cc.content_type AS "contentType",
  cc.display_name AS "displayName", cc.accent_color AS "accentColor", cc.services, cc.benefits,
  cc.is_ai_generated AS "isAiGenerated", cc.created_at AS "createdAt",
  c.slug AS "categorySlug", c.service_group AS "categoryServiceGroup"
`;

export async function getCategoryContent(
  categoryId: string,
  contentType: CategoryContentType,
): Promise<CategoryContent | null> {
  const { rows } = await pool.query(
    `SELECT ${CATEGORY_CONTENT_COLUMNS} FROM category_content
     WHERE category_id = $1 AND content_type = $2`,
    [categoryId, contentType],
  );
  return (rows[0] as CategoryContent | undefined) ?? null;
}

/**
 * ORDER BY cc.created_at ASC (insertion order), not display_name — deck generation relies on this
 * being the SAME order the categories were originally declared in the now-legacy hardcoded arrays
 * (serviceCatalog.ts's SERVICE_CATEGORIES / staticContent.ts's HOW_CAN_WE_HELP_BY_CATEGORY), so
 * that orderCategoriesForLead()'s "preserve the relative order of the rest" behavior produces the
 * exact same card order as before. migrations/0010_category_content.sql seeded the 4 categories'
 * rows in that same original order, so created_at ASC reproduces it. Only active categories'
 * content is returned, matching categoriesRepository.listActiveCategories()'s own filtering.
 */
export async function listAllCategoryContent(
  contentType: CategoryContentType,
): Promise<CategoryContentListItem[]> {
  const { rows } = await pool.query(
    `SELECT ${CATEGORY_CONTENT_LIST_COLUMNS}
     FROM category_content cc
     JOIN categories c ON c.id = cc.category_id
     WHERE cc.content_type = $1 AND c.is_active = true
     ORDER BY cc.created_at ASC`,
    [contentType],
  );
  return rows as CategoryContentListItem[];
}

export interface CreateCategoryContentInput {
  categoryId: string;
  contentType: CategoryContentType;
  displayName: string;
  accentColor?: string | null;
  services?: string[] | null;
  benefits?: string[] | null;
  isAiGenerated?: boolean;
}

/**
 * Not called anywhere yet — reserved for the future AI-generation path (a new category created
 * without hand-written deck content gets one here instead of falling back to nothing). Enforces
 * nothing about which of services/benefits should be set for which contentType; that pairing is
 * the caller's responsibility, same as the hand-seeded rows in migrations/0010_category_content.sql.
 */
export async function createCategoryContent(
  input: CreateCategoryContentInput,
): Promise<CategoryContent> {
  const { rows } = await pool.query(
    `INSERT INTO category_content (
       category_id, content_type, display_name, accent_color, services, benefits, is_ai_generated
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CATEGORY_CONTENT_COLUMNS}`,
    [
      input.categoryId,
      input.contentType,
      input.displayName,
      input.accentColor ?? null,
      input.services ? JSON.stringify(input.services) : null,
      input.benefits ? JSON.stringify(input.benefits) : null,
      input.isAiGenerated ?? false,
    ],
  );
  return rows[0] as CategoryContent;
}
