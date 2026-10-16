import 'dotenv/config';
import pg from 'pg';

// Tests set NODE_ENV=test so they hit the small test database, never the 100k-row one.
const connectionString =
  process.env.NODE_ENV === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

// A pool keeps a few connections open and reuses them, instead of paying
// for a new TCP + TLS handshake on every request.
export const pool = new pg.Pool({ connectionString });
