'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db');

/**
 * HTTP Basic auth, as an alternative to the session cookie.
 *
 * The browser app uses cookies; this exists so an API client (Postman, curl, CI) can
 * authenticate on a single request without running the login flow first.
 *
 * Credentials travel on EVERY request, base64-encoded but not encrypted, so this is
 * refused in production unless the deployment opts in with ALLOW_BASIC_AUTH=true and
 * is served over HTTPS.
 */
function basicAuthAllowed() {
  if (String(process.env.ALLOW_BASIC_AUTH || '').toLowerCase() === 'false') return false;
  if (String(process.env.ALLOW_BASIC_AUTH || '').toLowerCase() === 'true') return true;
  return process.env.NODE_ENV !== 'production'; // on by default in development only
}

/** Reads `Authorization: Basic ...` and returns the matching user, or null. */
async function userFromBasicAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('basic ') || !basicAuthAllowed()) return null;

  let email = '';
  let password = '';
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const split = decoded.indexOf(':');
    if (split === -1) return null;
    email = decoded.slice(0, split).trim().toLowerCase();
    password = decoded.slice(split + 1);
  } catch {
    return null;
  }
  if (!email || !password) return null;

  const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || user.status !== 'active') return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;

  return {
    id: user.id, name: user.name, email: user.email,
    role: user.role, status: user.status,
  };
}

/**
 * Populates req.session.user from Basic auth when there is no cookie session, so every
 * route downstream can keep reading req.session.user without knowing the difference.
 */
async function attachBasicAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  try {
    const user = await userFromBasicAuth(req);
    if (user) {
      req.session.user = user;
      req.basicAuth = true; // do not persist a session for a stateless call
    }
  } catch (err) {
    return next(err);
  }
  return next();
}

/** Requires any signed-in account. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Please sign in to continue.' });
}

/** Requires an admin account. */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'You need an administrator account for this.' });
  }
  return next();
}

/** Wraps an async handler so rejections reach the error middleware. */
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  requireAuth,
  requireAdmin,
  asyncRoute,
  attachBasicAuth,
  basicAuthAllowed,
};
