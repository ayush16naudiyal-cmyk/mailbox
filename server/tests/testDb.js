import fs from 'node:fs';
import { pool } from '../src/db.js';

const schemaSql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const fixturesSql = fs.readFileSync(new URL('./fixtures.sql', import.meta.url), 'utf8');

// Wipes the test database and loads the fixed fixtures, so every test starts
// from exactly the same data no matter what earlier tests changed.
export async function resetDb() {
  // Jest sets NODE_ENV=test, which makes db.js use DATABASE_URL_TEST.
  // This guard makes sure a mistake can never wipe the real database.
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDb() must only run with NODE_ENV=test');
  }

  // One round trip: drop, recreate and fill. No user input, so a plain string is fine here.
  await pool.query(
    `DROP TABLE IF EXISTS email_labels, labels, emails, users CASCADE;
     ${schemaSql}
     ${fixturesSql}`
  );
}

export { pool };
