# Deploying JunubSoftFlow

The front end and the API are hosted separately:

| | Host | URL |
|---|---|---|
| Front end | Netlify | https://junubsoftflow.netlify.app |
| API | Railway | https://junubsoftflow.up.railway.app |

They are **different sites**, which is the single fact that shapes most of the
configuration below — CORS, the session cookie, and the API base URL all exist
because of it.

---

## API on Railway

`backend/Dockerfile` builds the image; `railway.json` points Railway at it.

### Environment variables

Set these in Railway → your service → Variables. Railway supplies `PORT` itself,
and its MySQL plugin supplies `MYSQLHOST` / `MYSQLPORT` / `MYSQLUSER` /
`MYSQLPASSWORD` / `MYSQLDATABASE`, which `src/db.js` reads directly — no need to
copy them into `DB_*` aliases.

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Switches the session cookie to `SameSite=None; Secure`, without which the browser will not send it from Netlify |
| `CLIENT_ORIGIN` | `https://junubsoftflow.netlify.app` | The only origin CORS accepts. Comma-separate to allow more (e.g. a preview domain) |
| `SESSION_SECRET` | a long random string | Signs the session cookie. Changing it logs everyone out |
| `PUBLIC_URL` | `https://junubsoftflow.netlify.app` | Where links inside emails point |
| `SMTP_HOST` | `smtp.gmail.com` | Leave unset and the app sends nothing and says so |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | the sending mailbox | |
| `SMTP_PASS` | a Gmail **App Password** | Not the account password |
| `ALLOW_BASIC_AUTH` | `false` | HTTP Basic sends credentials on every request; leave it off unless a tool genuinely needs it |
| `SERVE_CLIENT` | `false` | Netlify serves the front end; the API only serves `/api` |

### The Dockerfile is at the repository root, deliberately

Railway's current builder is **Railpack**, and it does not read `railway.json`'s
`dockerfilePath` or `nixpacks.toml` - it inspects the project and generates its own
plan (`railpack-plan.json`). Left to guess, it read the root `package.json`, saw a
workspace, and emitted `COPY frontend/package.json` steps for an image that has
nothing to do with the front end. That is what kept failing:

```
copy frontend/package.json
"/frontend/package.json": not found
```

A `Dockerfile` at the repository root is what Railpack looks for, and finding one it
uses it instead of guessing. So the API image lives at `/Dockerfile`, not
`backend/Dockerfile`. Its `COPY` paths are root-relative because the build context is
the repository root.

There is also no `.dockerignore`: it once excluded `frontend` and made that manifest
vanish, and it excluded nothing real - `node_modules`, `dist`, `.env` and the uploads
are all gitignored, so they never reach a git-sourced context anyway. The whole
tracked tree is 3.4 MB.

The root scripts still work standalone, in case a generic Node builder is ever used:
`npm install` pulls the API's dependencies through `postinstall`, `npm run build`
asks for devDependencies explicitly so `vite` is present, and `npm start` runs the
API. Note `postinstall` uses `cd backend && npm install`, not `npm --prefix backend
install` - with `--prefix`, npm keeps the *root* as the lifecycle package and the
root postinstall re-triggers itself until it dies.

### If Railway keeps serving an old build

A failed build does not take the service down - Railway keeps the last deployment
that succeeded running. So "my fix is not working" and "my fix never built" look
identical from outside. `GET /api/health` reports the commit it is actually
running:

```json
{ "commit": "bd3daa8", "schemaSync": "enabled", "schema": "ready" }
```

If that does not match the tip of `main`, the build is failing or the service is
not watching this branch. The historical cause was `vite: not found`:

Nixpacks auto-detects the **root** `package.json`, whose build script builds the
front end, and `vite` is a devDependency that a production install omits. Netlify
builds the front end; this service is the API. Three things now prevent it:

- `railway.json` selects `backend/Dockerfile`, which has no build step at all
- `nixpacks.toml` builds only `backend/` if the service is pinned to Nixpacks
- the root build script installs devDependencies explicitly, so it works anyway

If a deploy still fails, check in the dashboard that the service **Builder** is
Dockerfile (or that `nixpacks.toml` is being picked up), that the watched branch
is `main`, and that auto-deploy is on.

### If the browser reports a CORS error

`No 'Access-Control-Allow-Origin' header is present` means the API refused the
origin. The `cors` package answers a rejected preflight with **204 and no
`Access-Control-Allow-Origin`**, which reaches the browser as an opaque failure -
so check the Railway logs, where the refusal is now named:

```
[cors] refused https://junubsoftflow.netlify.app - CLIENT_ORIGIN is "http://localhost:5173".
```

The fix is `CLIENT_ORIGIN=https://junubsoftflow.netlify.app` on the service.
Netlify deploy previews (`deploy-preview-7--junubsoftflow.netlify.app`) are
accepted automatically once the main site is allowed.

### If every request returns 500

`GET /api/health` answers without touching application tables, so it works even
when the schema does not:

```json
{ "ok": true, "schema": "not-migrated", "hint": "Run: node db/migrate.js && node db/seed.js" }
```

`schema: "not-migrated"` means the database is connected but empty - the
migration below has not been run. The server prints the same warning at startup.

### The schema creates itself

The API brings the database up to `db/schema.sql` every time it starts. A missing
table is created; a column that `schema.sql` has and the table does not is added.
Nothing is ever dropped, and an existing column is never retyped - those are the
operations that lose data, and a start-up routine has no business guessing whether
one is safe. A column whose type genuinely must change needs a person and a backup.

So a fresh Railway database needs no migration step: deploy, and the 23 tables
appear. `GET /api/health` reports `schema: "ready"` once they do.

This is deliberately *not* `db/migrate.js` on boot. That script applies
`schema.sql` verbatim, and the file drops all 23 tables before recreating them -
run on every deploy it would wipe production each time. `migrate.js` remains the
reset tool, for a first run or a deliberate rebuild.

Set `AUTO_SCHEMA_SYNC=false` to manage the schema by hand.

### Seed data is still manual

Creating the tables does not fill them. Without seeding there is **no administrator
account**, so run this once against the deployed database - over Railway's public
proxy (MySQL service → Variables → `MYSQL_PUBLIC_URL`), from `backend/`:

```bash
DB_HOST=<host>.proxy.rlwy.net DB_PORT=<port> DB_USER=root DB_PASSWORD=<password> DB_NAME=railway node db/seed.js
```

The private `*.railway.internal` host only resolves inside Railway's network, which
is why the public proxy is the one to use from outside.

`seed.js` **truncates every table it populates**. It is safe on a new database and
destructive on a live one.

### Change the seeded password immediately

`seed.js` creates `admin@softflow.com` / `admin123`. On a public site that is a
published credential: sign in and change it, or create your own administrator and
delete the seeded one, before doing anything else.

Seeding also inserts demo products, customers and orders. That is convenient for a
first look and wrong for a real storefront - delete what you do not want.

### Uploads will not survive a redeploy

A container filesystem is ephemeral. `storage/apk`, `storage/files` and
`storage/images` hold uploaded APKs, source bundles and product images, and all
of it is lost on the next deploy unless a **Railway volume is mounted at
`/app/storage`**. Attach one before uploading anything you would mind losing.

The alternative — object storage such as S3 or Cloudflare R2 — is the better
long-term answer, but it is a code change: `src/upload.js` writes to the local
disk today.

---

## Front end on Netlify

`netlify.toml` sets the build; `public/_redirects` carries the SPA fallback so a
refresh on `/products` serves the app instead of a 404.

One build-time variable, already committed in `frontend/.env.production`:

```
VITE_API_URL=https://junubsoftflow.up.railway.app/api
```

Vite inlines it at build time, so **changing it requires a rebuild**, not just a
restart. Locally it is left unset and the Vite proxy forwards `/api` to port
4000, which keeps the cookie first-party.

---

## Why the cookie settings look the way they do

The browser treats `netlify.app` → `railway.app` as cross-site. A `SameSite=Lax`
cookie is simply not sent on such a request, so sign-in would appear to succeed,
set a cookie, and then never see it again. `SameSite=None` is the only value sent
cross-site, and browsers accept it only alongside `Secure`, which in turn needs
HTTPS — Railway terminates TLS and forwards `X-Forwarded-Proto`, which is why
`app.set('trust proxy', 1)` matters.

`server.js` therefore uses `SameSite=None; Secure` when `NODE_ENV=production`
and `SameSite=Lax` otherwise.

---

## Social share cards

Facebook, LinkedIn, X and Google's crawler do not run JavaScript. Every tag they
read is static in `frontend/index.html`: Open Graph (Facebook, LinkedIn,
WhatsApp), Twitter Card, canonical, and JSON-LD for Google.

The consequence is that **every route previews as the home page**. Sharing a link
to one product shows the site card, not that product's. Fixing it properly needs
pre-rendering or server-side rendering for the crawler.

After changing any of it, ask the platforms to re-scrape — they cache for days:

- Facebook / LinkedIn: https://developers.facebook.com/tools/debug/ and
  https://www.linkedin.com/post-inspector/
- X: https://cards-dev.twitter.com/validator
- Google: Search Console → URL Inspection → Request indexing

The `sameAs` block in the JSON-LD and the `twitter:site` tag name social profiles.
**Remove any that do not exist** — claiming a profile you do not own is worse than
claiming none.

---

## Changing the domain

The host appears in five places that must move together, or a stale card stays
cached for days:

- `frontend/index.html` (canonical, `og:url`, `og:image`, all of the JSON-LD)
- `frontend/public/sitemap.xml`
- `frontend/public/robots.txt`
- `frontend/src/hooks/usePageMeta.js`
- Settings → General → **Website address**, which is where email links come from
