'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');

const db = require('./src/db');
const { syncSchema } = require('./src/schema-sync');
const bcrypt = require('bcryptjs');

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
  // 200 whenever the process is alive, whatever the database is doing.
  //
  // The platform health check reads the status code. If an unreachable database
  // answered 503 here, the deploy would be marked unhealthy and torn down - and the
  // one endpoint that names the problem would disappear with it. Liveness is the
  // status code; readiness is the body.
  let reachable = true;
  let dbError = null;
  try {
    await db.query('SELECT 1');
  } catch (err) {
    reachable = false;
    dbError = err.code || err.message;
  }

  if (!reachable) {
    return res.json({
      ok: false,
      service: 'softflow-api',
      database: 'unreachable',
      error: dbError,
      uptime: Math.round(process.uptime()),
      commit: (process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown').slice(0, 7),
      hint: 'check the database variables on the service, and that the database is running',
    });
  }

  const out = {
    ok: true,
    service: 'softflow-api',
    database: db.config.database,
    basicAuth: basicAuthAllowed(),
    uptime: Math.round(process.uptime()),
    // Which build is actually running. Railway injects the commit it deployed, and
    // without it there is no way to tell "the fix is not working" from "the fix is
    // not deployed yet" - two problems with completely different answers.
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown').slice(0, 7),
    schemaSync: process.env.AUTO_SCHEMA_SYNC === 'false' ? 'disabled' : 'enabled',
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
const DB_DOWN = new Set(['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ENOTFOUND', 'ETIMEDOUT']);

app.use((err, req, res, _next) => {
  // "the database is away" is a 503, not a 500: it is temporary, and saying so lets
  // a caller retry rather than treat the request itself as malformed
  const code = String(err.code || '');
  const status = err.status
    || (code.startsWith('LIMIT_') ? 400 : DB_DOWN.has(code) ? 503 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message || 'Server error',
  });
});

/* ---------- boot ---------- */
/**
 * Bring the database up to db/schema.sql.
 *
 * Additive only - it creates missing tables and missing columns, and never drops or
 * retypes. That distinction is the whole reason this is not just `migrate.js` on
 * boot: schema.sql drops all 23 tables before recreating them, so running the file
 * itself here would wipe the database on every single deploy.
 *
 * Set AUTO_SCHEMA_SYNC=false to manage the schema by hand instead.
 */
async function applySchema() {
  if (process.env.AUTO_SCHEMA_SYNC === 'false') {
    try {
      await db.query('SELECT 1 FROM settings LIMIT 1');
    } catch {
      console.error('  schema NOT migrated and AUTO_SCHEMA_SYNC=false - requests will return 500.');
      console.error('         run: node db/migrate.js && node db/seed.js');
    }
    return;
  }
  try {
    await syncSchema(db);
  } catch (err) {
    console.error('  schema sync FAILED:', err.message);
    console.error('         the API will start, but requests touching missing tables will fail.');
  }
}

/** Create the first administrator only when an operator supplies a password. */
async function ensureAdmin() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  if (password.length < 8) {
    console.error('  admin  ADMIN_PASSWORD must contain at least 8 characters; skipped');
    return;
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@softflow.com').trim().toLowerCase();
  const existing = await db.one('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    console.log(`  admin  ${email} already exists`);
    return;
  }

  const role = await db.one('SELECT id FROM roles WHERE slug = ?', ['administrator']);
  await db.run(
    `INSERT INTO users (name, email, password_hash, role, role_id, status)
     VALUES (?, ?, ?, 'admin', ?, 'active')`,
    ['Administrator', email, bcrypt.hashSync(password, 12), role ? role.id : null]
  );
  console.log(`  admin  created ${email}`);
}

/**
 * Connect, sync the schema, and say what happened. Returns false if the database
 * could not be reached.
 */
async function connectAndSync() {
  try {
    await db.query('SELECT 1');
    console.log(`  db     connected -> ${db.config.database}@${db.config.host}:${db.config.port}`);
  } catch (e) {
    console.error(`  db     FAILED to connect to ${db.config.database}@${db.config.host}:${db.config.port}`);
    console.error(`         ${e.code || e.message}`);
    console.error('         check the database variables, and that the database is running.');
    return false;
  }
  await applySchema();
  try {
    await ensureAdmin();
  } catch (err) {
    console.error('  admin  bootstrap failed:', err.message);
  }
  return true;
}

async function start() {
  /*
   * A database that is unreachable at boot must not stop the process.
   *
   * This used to exit(1) here, before app.listen. The effect on a hosted platform is
   * that a missing database variable, or a database still starting up, leaves no
   * healthy deployment at all - the edge answers "Application not found", and even
   * /api/health is gone, so the one endpoint that could name the problem is the one
   * you cannot reach. A browser then reports it as a CORS failure, because a 404
   * from the edge carries no Access-Control-Allow-Origin, which sends you looking in
   * entirely the wrong place.
   *
   * So: serve regardless, report the truth on /api/health, and keep trying.
   */
  const connected = await connectAndSync();

  if (!connected) {
    console.error('  db     starting anyway - /api/health will report the failure');
    const RETRY_MS = 15000;
    const retry = setInterval(async () => {
      if (await connectAndSync()) {
        console.log('  db     recovered');
        clearInterval(retry);
      }
    }, RETRY_MS);
    retry.unref();
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
    if (process.env.ADMIN_PASSWORD) console.log(`  admin  ${process.env.ADMIN_EMAIL || 'admin@softflow.com'}`);
    console.log('');
  });
}

start();

module.exports = app;
