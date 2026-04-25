/**
 * Modul: Authentifizierung (Auth)
 * Zweck: Login-Route, Session-Middleware, Auth-Guard für geschützte Routen
 * Abhängigkeiten: express, bcrypt, express-session, server/db.js
 */

import express from 'express';
import bcrypt from 'bcrypt';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import * as db from './db.js';
import { generateToken, csrfMiddleware } from './middleware/csrf.js';
import { createLogger } from './logger.js';

const log = createLogger('Auth');
const router = express.Router();
const API_TOKEN_PREFIX = 'oikos_';

// --------------------------------------------------------
// Session-Store (better-sqlite3, gleiche DB-Instanz wie App)
// Eigene Implementierung - kein connect-sqlite3 (nutzt sqlite3-Bindings,
// die separat kompiliert werden müssten und die Fehlerquelle waren).
// --------------------------------------------------------
class BetterSQLiteStore extends session.Store {
  constructor() {
    super();
    // Tabelle anlegen falls nicht vorhanden
    db.get().exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid        TEXT PRIMARY KEY,
        sess       TEXT NOT NULL,
        expired_at INTEGER NOT NULL
      )
    `);
    // Abgelaufene Sessions regelmäßig aufräumen (alle 15 Minuten)
    setInterval(() => {
      db.get().prepare('DELETE FROM sessions WHERE expired_at <= ?').run(Date.now());
    }, 15 * 60_000).unref();
  }

  get(sid, callback) {
    try {
      const row = db.get()
        .prepare('SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?')
        .get(sid, Date.now());
      callback(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const ttl = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + ttl;
      db.get()
        .prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), expiredAt);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      db.get().prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const ttl = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + ttl;
      db.get()
        .prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?')
        .run(expiredAt, sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

const sessionStore = new BetterSQLiteStore();

/**
 * Session-Middleware konfigurieren.
 * Wird in server/index.js eingebunden.
 */
if (!process.env.SESSION_SECRET) {
  throw new Error('[Auth] SESSION_SECRET must be set in .env. Run: node setup.js');
}

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'oikos.sid',
  cookie: {
    httpOnly: true,
    // secure=true by default; set SESSION_SECURE=false in .env to allow HTTP (local dev without reverse proxy)
    secure: process.env.SESSION_SECURE !== 'false',
    // lax (not strict): Safari ITP blocks strict cookies on certain navigations
    // (e.g. reverse proxy, direct URL entry), causing 401 on login. Lax is safe
    // because CSRF is protected by the double-submit token and HTTPS secure flag.
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 Tage in ms
  },
});

// --------------------------------------------------------
// Rate Limiting für Login
// --------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Login-Versuche. Bitte warte kurz.', code: 429 },
});

function hashApiToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function extractApiToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-api-key'] || '').trim();
}

function publicApiToken(row) {
  return {
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    created_by: row.created_by,
    creator_name: row.creator_name,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

function authenticateApiToken(req) {
  const token = extractApiToken(req);
  if (!token) return null;

  const tokenHash = hashApiToken(token);
  const row = db.get().prepare(`
    SELECT t.*, u.role, u.username, u.display_name, u.avatar_color
    FROM api_tokens t
    JOIN users u ON u.id = t.created_by
    WHERE t.token_hash = ?
      AND t.revoked_at IS NULL
      AND (t.expires_at IS NULL OR t.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  `).get(tokenHash);
  if (!row) return null;

  db.get().prepare(`
    UPDATE api_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).run(row.id);

  req.apiToken = publicApiToken(row);
  req.user = {
    id: row.created_by,
    username: row.username,
    display_name: row.display_name,
    avatar_color: row.avatar_color,
    role: row.role,
  };
  return row;
}

// --------------------------------------------------------
// Auth-Guard Middleware
// --------------------------------------------------------

/**
 * Prüft ob der Request authentifiziert ist.
 * Schützt alle API-Routen außer /auth/login.
 */
function requireAuth(req, res, next) {
  const apiToken = authenticateApiToken(req);
  if (apiToken) {
    req.authMethod = 'api_token';
    req.session = {
      userId: apiToken.created_by,
      role: apiToken.role,
    };
    return next();
  }

  if (req.session && req.session.userId) {
    req.authMethod = 'session';
    return next();
  }
  res.status(401).json({ error: 'Not authenticated.', code: 401 });
}

/**
 * Prüft ob der authentifizierte User Admin-Rolle hat.
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  res.status(403).json({ error: 'Permission denied.', code: 403 });
}

// --------------------------------------------------------
// Routen
// --------------------------------------------------------

const avatarColors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55'];

/**
 * POST /api/v1/auth/login
 * Body: { username: string, password: string }
 * Response: { user: { id, username, display_name, avatar_color, role } }
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.', code: 400 });
    }

    if (username.length > 64 || password.length > 1024) {
      return res.status(400).json({ error: 'Input is too long.', code: 400 });
    }

    const user = db.get().prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      // Timing-Attack-Schutz: trotzdem bcrypt ausführen
      await bcrypt.compare(password, '$2b$12$invalidhashfortimingprotection000000000000000000000');
      return res.status(401).json({ error: 'Invalid credentials.', code: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.', code: 401 });
    }

    req.session.regenerate((err) => {
      if (err) {
        log.error('Session regeneration failed:', err);
        return res.status(500).json({ error: 'Internal server error.', code: 500 });
      }

      req.session.userId    = user.id;
      req.session.role      = user.role;
      req.session.csrfToken = generateToken();

      // CSRF-Token als Cookie setzen (nicht httpOnly → lesbar für JS)
      res.cookie('csrf-token', req.session.csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.SESSION_SECURE !== 'false',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      res.json({
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          avatar_color: user.avatar_color,
          role: user.role,
        },
        csrfToken: req.session.csrfToken,
      });
    });
  } catch (err) {
    log.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

/**
 * POST /api/v1/auth/logout
 * Response: { ok: true }
 */
router.post('/logout', requireAuth, csrfMiddleware, (req, res) => {
  if (req.authMethod === 'api_token') {
    return res.json({ ok: true });
  }
  req.session.destroy((err) => {
    if (err) {
      log.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed.', code: 500 });
    }
    res.clearCookie('oikos.sid');
    res.json({ ok: true });
  });
});

/**
 * POST /api/v1/auth/setup
 * First-run bootstrap: creates the first admin when no users exist.
 * Returns 403 if any user already exists.
 * Body: { username: string, display_name: string, password: string }
 * Response: { user: { id, username, display_name, avatar_color, role } }
 */
router.post('/setup', loginLimiter, async (req, res) => {
  try {
    const { count } = db.get().prepare('SELECT COUNT(*) as count FROM users').get();
    if (count > 0) {
      return res.status(403).json({ error: 'Setup has already been completed.', code: 403 });
    }

    const username = (req.body.username || '').trim();
    const display_name = (req.body.display_name || '').trim();
    const { password } = req.body;

    if (!username || !display_name || !password) {
      return res.status(400).json({ error: 'Username, display name, and password are required.', code: 400 });
    }
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-64 characters long and may only contain letters, numbers, dots, hyphens, and underscores.', code: 400 });
    }
    if (display_name.length > 128) {
      return res.status(400).json({ error: 'Display name may be at most 128 characters long.', code: 400 });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.', code: 400 });
    }

    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    const hash = await bcrypt.hash(password, 12);

    const result = db.get()
      .prepare('INSERT INTO users (username, display_name, password_hash, avatar_color, role) VALUES (?, ?, ?, ?, ?)')
      .run(username, display_name, hash, avatarColor, 'admin');

    res.status(201).json({
      user: { id: result.lastInsertRowid, username, display_name, avatar_color: avatarColor, role: 'admin' },
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Username is already taken.', code: 409 });
    }
    log.error('Setup error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

/**
 * GET /api/v1/auth/me
 * Response: { user: { id, username, display_name, avatar_color, role } }
 */
router.get('/me', requireAuth, (req, res) => {
  try {
    const user = db.get()
      .prepare('SELECT id, username, display_name, avatar_color, role FROM users WHERE id = ?')
      .get(req.session.userId);

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found.', code: 401 });
    }

    if (req.authMethod === 'api_token') {
      return res.json({ user });
    }

    // CSRF-Token erneuern falls vorhanden (wichtig fuer iOS-PWA-Resume:
    // iOS kann den CSRF-Cookie verwerfen waehrend die Session-Cookie erhalten bleibt.
    // /me ist der erste API-Call nach App-Resume, also hier den Cookie wiederherstellen.)
    if (!req.session.csrfToken) {
      req.session.csrfToken = generateToken();
    }
    res.cookie('csrf-token', req.session.csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.SESSION_SECURE !== 'false',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    res.json({ user, csrfToken: req.session.csrfToken });
  } catch (err) {
    log.error('/me error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

/**
 * GET /api/v1/auth/users
 * Admin only. Listet alle Familienmitglieder.
 * Response: { data: User[] }
 */
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const users = db.get()
      .prepare('SELECT id, username, display_name, avatar_color, role, created_at FROM users ORDER BY display_name')
      .all();
    res.json({ data: users });
  } catch (err) {
    log.error('Users error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

router.get('/api-tokens', requireAuth, requireAdmin, (req, res) => {
  try {
    const rows = db.get().prepare(`
      SELECT t.*, u.display_name AS creator_name
      FROM api_tokens t
      LEFT JOIN users u ON u.id = t.created_by
      ORDER BY t.created_at DESC
    `).all();
    res.json({ data: rows.map(publicApiToken) });
  } catch (err) {
    log.error('API token list error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

router.post('/api-tokens', requireAuth, requireAdmin, csrfMiddleware, (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const expiresAt = req.body.expires_at ? String(req.body.expires_at).trim() : null;

    if (!name) return res.status(400).json({ error: 'Token name is required.', code: 400 });
    if (name.length > 100) return res.status(400).json({ error: 'Token name may be at most 100 characters long.', code: 400 });
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
      return res.status(400).json({ error: 'expires_at must be a valid ISO date/time.', code: 400 });
    }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Expiration date must be in the future.', code: 400 });
    }

    const token = API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashApiToken(token);
    const tokenPrefix = token.slice(0, 12);
    const normalizedExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : null;

    const result = db.get().prepare(`
      INSERT INTO api_tokens (name, token_hash, token_prefix, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, tokenHash, tokenPrefix, req.session.userId, normalizedExpiresAt);

    const row = db.get().prepare(`
      SELECT t.*, u.display_name AS creator_name
      FROM api_tokens t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ data: publicApiToken(row), token });
  } catch (err) {
    log.error('API token creation error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

router.delete('/api-tokens/:id', requireAuth, requireAdmin, csrfMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid token ID.', code: 400 });

    const result = db.get().prepare(`
      UPDATE api_tokens
      SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      WHERE id = ?
    `).run(id);

    if (result.changes === 0) return res.status(404).json({ error: 'API token not found.', code: 404 });
    res.json({ ok: true });
  } catch (err) {
    log.error('API token revocation error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

/**
 * POST /api/v1/auth/users
 * Admin only. Erstellt neues Familienmitglied.
 * Body: { username, display_name, password, avatar_color?, role? }
 * Response: { user: { id, username, display_name, avatar_color, role } }
 */
router.post('/users', requireAuth, requireAdmin, csrfMiddleware, async (req, res) => {
  try {
    const { username, display_name, password, avatar_color = '#007AFF', role = 'member' } = req.body;

    if (!username || !display_name || !password) {
      return res.status(400).json({ error: 'Username, display name, and password are required.', code: 400 });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.', code: 400 });
    }

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-64 characters long and may only contain letters, numbers, dots, hyphens, and underscores.', code: 400 });
    }

    if (display_name.length > 128) {
      return res.status(400).json({ error: 'Display name may be at most 128 characters long.', code: 400 });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.', code: 400 });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = db.get()
      .prepare(`
        INSERT INTO users (username, display_name, password_hash, avatar_color, role)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(username, display_name, hash, avatar_color, role);

    res.status(201).json({
      user: { id: result.lastInsertRowid, username, display_name, avatar_color, role },
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Username is already taken.', code: 409 });
    }
    log.error('User creation error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

/**
 * PATCH /api/v1/auth/me/password
 * Ändert das eigene Passwort.
 * Body: { current_password: string, new_password: string }
 * Response: { ok: true }
 */
router.patch('/me/password', requireAuth, csrfMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required.', code: 400 });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.', code: 400 });
    }

    const user = db.get().prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found.', code: 404 });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.', code: 401 });

    const hash = await bcrypt.hash(new_password, 12);
    db.get().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.userId);

    // Alle anderen Sessions dieses Users invalidieren (aktuelle behalten)
    const currentSid = req.sessionID;
    const allSessions = db.get().prepare('SELECT sid, sess FROM sessions').all();
    for (const row of allSessions) {
      if (row.sid === currentSid) continue;
      try {
        const sess = JSON.parse(row.sess);
        if (sess.userId === req.session.userId) {
          db.get().prepare('DELETE FROM sessions WHERE sid = ?').run(row.sid);
        }
      } catch { /* ignore malformed session */ }
    }

    res.json({ ok: true });
  } catch (err) {
    log.error('Password change error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

/**
 * DELETE /api/v1/auth/users/:id
 * Admin only. Löscht ein Familienmitglied.
 * Response: { ok: true }
 */
router.delete('/users/:id', requireAuth, requireAdmin, csrfMiddleware, (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account.', code: 400 });
    }

    const result = db.get().prepare('DELETE FROM users WHERE id = ?').run(userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found.', code: 404 });
    }

    // Alle aktiven Sessions des geloeschten Users invalidieren
    const allSessions = db.get().prepare('SELECT sid, sess FROM sessions').all();
    for (const row of allSessions) {
      try {
        const sess = JSON.parse(row.sess);
        if (sess.userId === userId) {
          db.get().prepare('DELETE FROM sessions WHERE sid = ?').run(row.sid);
        }
      } catch { /* ignore malformed session */ }
    }

    res.json({ ok: true });
  } catch (err) {
    log.error('User deletion error:', err);
    res.status(500).json({ error: 'Internal server error.', code: 500 });
  }
});

export { router, sessionMiddleware, requireAuth, requireAdmin };
