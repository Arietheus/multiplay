// Database layer: a single Postgres pool + schema bootstrap.
// We point at DATABASE_URL (Neon, Supabase, Render PG — any standard Postgres).
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\n[FATAL] DATABASE_URL is not set. See README.md ("Set up the database").\n');
  process.exit(1);
}

// Cloud Postgres (Neon etc.) requires TLS; local dev usually doesn't.
const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             BIGSERIAL PRIMARY KEY,
      username       TEXT NOT NULL,
      username_lower TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,          -- SHA-256 of the raw cookie token
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);`);
  console.log('Database ready.');
}

module.exports = { pool, init };
