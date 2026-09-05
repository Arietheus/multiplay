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
  // progression: slag (currency) + best wave reached
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS slag INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_wave INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cosmetics TEXT NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS crest TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wake TEXT;`);
  console.log('Database ready.');
}

function parseList(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }

// Fetch a player's persisted progression (currency, best wave, cosmetics).
async function getProgress(userId) {
  const r = await pool.query('SELECT slag, best_wave, cosmetics, crest, wake FROM users WHERE id = $1', [userId]);
  const row = r.rows[0] || {};
  return { slag: row.slag || 0, bestWave: row.best_wave || 0, cosmetics: parseList(row.cosmetics), crest: row.crest || null, wake: row.wake || null };
}

// Bank a finished run: add slag, raise best wave. Returns new totals.
async function bankRun(userId, addSlag, wave) {
  const r = await pool.query(
    `UPDATE users SET slag = slag + $2, best_wave = GREATEST(best_wave, $3)
     WHERE id = $1 RETURNING slag, best_wave`,
    [userId, Math.max(0, addSlag | 0), Math.max(0, wave | 0)]);
  return r.rows[0] ? { slag: r.rows[0].slag, bestWave: r.rows[0].best_wave } : null;
}

// Persist a purchase (new slag balance + owned list).
async function saveCosmetics(userId, slag, owned) {
  const r = await pool.query('UPDATE users SET slag = $2, cosmetics = $3 WHERE id = $1 RETURNING slag',
    [userId, Math.max(0, slag | 0), JSON.stringify(owned)]);
  return r.rows[0] ? r.rows[0].slag : slag;
}

// Persist equipped crest + wake.
async function setEquipped(userId, crest, wake) {
  await pool.query('UPDATE users SET crest = $2, wake = $3 WHERE id = $1', [userId, crest || null, wake || null]);
}

module.exports = { pool, init, getProgress, bankRun, saveCosmetics, setEquipped };
