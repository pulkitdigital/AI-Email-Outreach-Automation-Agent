import { Pool } from 'pg';
import { env } from '../config/env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on('error', (err) => {
  // A background/idle client emitting an error must not crash the process — log with enough
  // context to investigate, per the project's "no silent failures" requirement.
  console.error('[db] unexpected error on idle Postgres client', err);
});
