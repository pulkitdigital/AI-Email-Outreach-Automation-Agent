import { pool } from '../src/db/pool.js';

async function main() {
  const { rows: leadRows } = await pool.query(
    `SELECT id, status, category_id FROM leads WHERE id = $1`,
    ['b01f4787-9358-4695-be6a-0148be66a34a'],
  );
  console.log('lead:', leadRows[0]);

  const { rows: deckRows } = await pool.query(
    `SELECT id, generation_status, generation_error, file_key, pdf_file_key, created_at
     FROM pitch_decks WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
    ['b01f4787-9358-4695-be6a-0148be66a34a'],
  );
  console.log('deck:', deckRows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
