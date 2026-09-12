'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');

const db = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.set('trust proxy', 1);

/**
 * The front end and the API are separate sites in production - Netlify and Railway -
 * so the session cookie is a third-party cookie as far as the browser is concerned.
 * A SameSite=Lax cookie is simply not sent on a cross-site XHR: sign-in would appear
 * to succeed, set a cookie, and then never see it again. SameSite=None is the only
 * value browsers send cross-site, and they only accept it alongside Secure.
 *
 * Locally the Vite proxy keeps everything on one origin, where Lax is the safer choice
 * because it is not exposed to cross-site requests at all.
 */
const IS_PROD = process.env.NODE_ENV === 'production';
const CROSS_SITE = IS_PROD || process.env.CROSS_SITE_COOKIE === 'true';

/* ---------- CORS (credentials on, so the session cookie travels) ---------- */

const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

/**
 * Netlify gives every branch and pull request its own hostname
 * (deploy-preview-4--site.netlify.app). Listing them is impossible, so any subdomain
 * of an allowed netlify.app site is accepted too.
 */
function originAllowed(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGINS.some((allowed) => {
    const m = allowed.match(/^https:\/\/([a-z0-9-]+)\.netlify\.app$/i);
    return m && new RegExp(`^https://[a-z0-9-]+--${m[1]}\.netlify\.app$`, 'i').test(origin || '');
  });
}

const rejectedOrigins = new Set();

app.use(
  cors({
    origin(origin, callback) {
      // no Origin header at all: curl, Postman, server-to-server. Not a browser, so
      // there is no cross-site risk to guard against here.
      if (!origin) return callback(null, true);
      if (originAllowed(origin)) return callback(null, true);

      // The cors package answers a rejected preflight with 204 and simply omits
      // Access-Control-Allow-Origin, which reaches the browser as an opaque CORS
      // error with nothing in the server log. Say it out loud, once per origin.
      if (!rejectedOrigins.has(origin)) {
        rejectedOrigins.add(origin);
        console.error(
          `[cors] refused ${origin} - CLIENT_ORIGIN is ${JSON.stringify(CLIENT_ORIGIN)}. ` +
          "Set CLIENT_ORIGIN to the address the front end is served from."
        );
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ---------- sessions in MySQL ---------- */
const CLEAR_EXPIRED_EVERY = 900000;

const sessionStore = new MySQLStore({
  host: db.config.host,
  port: db.config.port,
  user: db.config.user,
  password: db.config.password,
  database: db.config.database,
  createDatabaseTable: true,
  // the library's own sweep is replaced below, so do not start it here
  clearExpired: false,
  expiration: 1000 * 60 * 60 * 24 * 7,
});

/**
 * Sweep expired sessions ourselves.
 *
 * express-mysql-session schedules clearExpiredSessions() with setInterval and never
 * catches the promise it returns (index.js:401). The sweep rethrows on failure, so a
 * database that is briefly unreachable - restarted, failed over, XAMPP toggled - became
 * an unhandled rejection and took the whole API process down with it.
 *
 * Tidying old rows is maintenance: it should be logged when it fails, not fatal. The
 * timer is unref'd so it never keeps the process alive on its own.
 */
setInterval(() => {
  sessionStore.clearExpiredSessions().catch((err) => {
    console.error('[session] could not clear expired sessions:', err.code || err.message);
  });
}, CLEAR_EXPIRED_EVERY).unref();

app.use(
  session({
    name: 'softflow.sid',
    secret: process.env.SESSION_SECRET || 'softflow-dev-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: CROSS_SITE ? 'none' : 'lax',
      // SameSite=None is rejected by browsers unless Secure is set, so these move together
      secure: CROSS_SITE,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// Accepts `Authorization: Basic <base64 email:password>` where no cookie session
// exists, so Postman and curl can call the API without running the login flow.
const { attachBasicAuth, basicAuthAllowed } = require('./src/middleware/auth');
app.use('/api', attachBasicAuth);

/* ---------- routes ---------- */
/**
 * Liveness, plus a separate readiness verdict.
 *
 * A platform health check must not depend on application tables: if the schema has
 * not been migrated, a table-backed check reports the container unhealthy and the
 * deploy restart-loops, hiding the real problem. So a reachable database answers 200
 * either way, and `schema` says whether the tables are actually there.
 */
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
  } catch (err) {
    return res.status(503).json({ ok: false, database: 'unreachable', error: err.code || err.message });
  }

  const out = {
    ok: true,
    service: 'softflow-api',
    database: db.config.database,
    basicAuth: basicAuthAllowed(),
    uptime: Math.round(process.uptime()),
    schema: 'ready',
  };
  try {
    await db.query('SELECT 1 FROM settings LIMIT 1');
  } catch {
    out.schema = 'not-migrated';
    out.hint = 'Run: node db/migrate.js && node db/seed.js';
  }
  res.json(out);
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/shop', require('./src/routes/shop'));
app.use('/api/account', require('./src/routes/account'));
app.use('/api/admin', require('./src/routes/admin'));

/* ---------- production: serve the built React app ---------- */
const clientDist = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.SERVE_CLIENT === 'true') {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ---------- errors ---------- */
app.use((err, req, res, _next) => {
  const status = err.status || (String(err.code || '').startsWith('LIMIT_') ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message || 'Server error',
  });
});

/* ---------- boot ---------- */
async function start() {
  try {
    await db.query('SELECT 1');
    console.log(`  db     connected -> ${db.config.database}@${db.config.host}:${db.config.port}`);
  } catch (e) {
    console.error('  db     FAILED to connect:', e.message);
    console.error('         check backend/.env and that MySQL is running.');
    process.exit(1);
  }

  // A schema that was never migrated connects fine and then fails every query, which
  // surfaces as an opaque 500. Name it here instead.
  try {
    await db.query('SELECT 1 FROM settings LIMIT 1');
  } catch {
    console.error('  schema NOT migrated - every request will return 500.');
    console.error('         run: node db/migrate.js && node db/seed.js');
  }

  if (IS_PROD && ALLOWED_ORIGINS.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
    console.error(`  cors   CLIENT_ORIGIN is ${JSON.stringify(CLIENT_ORIGIN)} in production.`);
    console.error('         a browser on the real front end will be refused. Set it to that address.');
  }

  // 0.0.0.0, not localhost: inside a container the health check arrives from outside
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  SoftFlow API');
    console.log(`  api    http://localhost:${PORT}/api`);
    console.log(`  cors   ${CLIENT_ORIGIN}`);
    console.log('');
    console.log('  admin  admin@softflow.com / admin123');
    console.log('  user   john@example.com   / user123');
    console.log('');
  });
}

start();

module.exports = app;
