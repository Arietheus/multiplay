// Authentication & sessions.
//
// Security design (the parts that matter):
//  - Passwords hashed with argon2id (memory-hard, OWASP-recommended defaults).
//  - Session tokens are 256 bits of CSPRNG randomness. We store only their
//    SHA-256 in the DB, so a database leak does not hand out live sessions.
//  - The raw token lives in an httpOnly + Secure + SameSite=Lax cookie, so
//    page JavaScript can't read it (XSS can't steal it) and it isn't sent
//    on cross-site requests (blunts CSRF).
//  - Login is constant-ish time and returns the same error whether the user
//    exists or the password was wrong (no username enumeration).
//  - Register/login are rate-limited per IP.
//  - All SQL is parameterized (no string building) so there's no injection.

const crypto = require('crypto');
const cookie = require('cookie');
const argon2 = require('@node-rs/argon2');
const { pool } = require('./db');

const COOKIE_NAME = 'sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Precomputed at startup so a login against a non-existent user still spends
// time verifying a hash (defeats timing-based user enumeration).
let DUMMY_HASH = null;

async function init() {
  DUMMY_HASH = await argon2.hash(crypto.randomBytes(16).toString('hex'));
  // Sweep expired sessions hourly.
  setInterval(() => {
    pool.query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
  }, 60 * 60 * 1000);
}

// ---- helpers ----
const validUsername = (u) => typeof u === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(u);
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function getCookieToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  try { return cookie.parse(header)[COOKIE_NAME] || null; } catch { return null; }
}

async function startSession(req, res, userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, expires]
  );
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: req.secure, // true behind Render's HTTPS proxy (trust proxy is set)
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  }));
}

async function getUserFromToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

// ---- very small in-memory rate limiter (per IP + bucket) ----
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
  b.count += 1;
  return b.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 10 * 60 * 1000);

// ---- route handlers ----
async function register(req, res) {
  if (!allow(`reg:${req.ip}`, 10, 60 * 60 * 1000))
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });

  const { username, password } = req.body || {};
  if (!validUsername(username))
    return res.status(400).json({ error: 'Username must be 3–20 characters: letters, numbers, or underscores.' });
  if (!validPassword(password))
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const hash = await argon2.hash(password);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, username_lower, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username, username.toLowerCase(), hash]
    );
    await startSession(req, res, rows[0].id);
    res.json({ username: rows[0].username });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username is taken.' });
    console.error('register error', e);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function login(req, res) {
  if (!allow(`login:${req.ip}`, 20, 15 * 60 * 1000))
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Invalid username or password.' });

  const { rows } = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE username_lower = $1',
    [username.toLowerCase()]
  );
  const user = rows[0];
  // Always run a verify (real hash or dummy) so timing doesn't leak existence.
  const ok = await argon2.verify(user ? user.password_hash : DUMMY_HASH, password).catch(() => false);
  if (!user || !ok)
    return res.status(401).json({ error: 'Invalid username or password.' });

  await startSession(req, res, user.id);
  res.json({ username: user.username });
}

async function logout(req, res) {
  const token = getCookieToken(req);
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/', maxAge: 0,
  }));
  res.json({ ok: true });
}

async function me(req, res) {
  const user = await getUserFromToken(getCookieToken(req));
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ id: String(user.id), username: user.username });
}

// Used during the WebSocket HTTP upgrade.
async function authenticateWs(req) {
  return getUserFromToken(getCookieToken(req));
}

module.exports = { init, register, login, logout, me, authenticateWs };
