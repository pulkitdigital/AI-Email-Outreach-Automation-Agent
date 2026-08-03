import type { ServiceGroup } from '@bebeyond/shared';
import { pool } from '../pool.js';

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  serviceGroup: ServiceGroup | null;
}

export async function listActiveCategories(): Promise<CategoryRecord[]> {
  const { rows } = await pool.query(
    `SELECT id, name, slug, service_group AS "serviceGroup"
     FROM categories
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return rows as CategoryRecord[];
}

export async function getCategoryById(id: string): Promise<CategoryRecord | null> {
  const { rows } = await pool.query(
    `SELECT id, name, slug, service_group AS "serviceGroup" FROM categories WHERE id = $1`,
    [id],
  );
  return (rows[0] as CategoryRecord | undefined) ?? null;
}
