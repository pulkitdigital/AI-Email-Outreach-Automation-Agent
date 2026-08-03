import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Minimal, dependency-free migration runner: numbered .sql files in ./migrations, applied in
 * filename order inside a transaction each, tracked in schema_migrations. No down-migrations —
 * this is a young project with no production data yet; forward-only is the right amount of
 * ceremony for now.
 */
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function run(): Promise<void> {
  await ensureMigrationsTable();

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`[migrate] applying ${file}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${file}`);
      appliedCount += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] failed on ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(
    appliedCount === 0
      ? '[migrate] already up to date'
      : `[migrate] applied ${appliedCount} migration(s)`,
  );
  await pool.end();
}

run().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exitCode = 1;
});
