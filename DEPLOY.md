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

### First deploy: create the schema

The container does not migrate on start-up, because `db/schema.sql` **drops every
table before recreating it**. Running it automatically would wipe the database on
every deploy. It is a first-run tool, run deliberately, once.

`db/migrate.js` takes its connection from `src/db.js`, so it understands Railway's
`MYSQL*` variables, and it rewrites the `CREATE DATABASE ... USE ...` header in
`schema.sql` to whatever database is configured - Railway names yours `railway`,
not `junubsoftflow`, and the user usually has no CREATE DATABASE grant.

**From your own machine, over Railway's public proxy** (simplest):

Railway → MySQL service → Variables → copy `MYSQL_PUBLIC_URL`. It looks like
`mysql://root:PASSWORD@shinkansen.proxy.rlwy.net:12345/railway`. Then, from
`backend/`:

```bash
DB_HOST=shinkansen.proxy.rlwy.net DB_PORT=12345 DB_USER=root DB_PASSWORD=PASSWORD DB_NAME=railway node db/migrate.js && DB_HOST=shinkansen.proxy.rlwy.net DB_PORT=12345 DB_USER=root DB_PASSWORD=PASSWORD DB_NAME=railway node db/seed.js
```

The private `*.railway.internal` host only resolves inside Railway's network, so
the public proxy is what works from outside.

**Or as a one-off inside Railway**: temporarily set the service's start command to

```
node db/migrate.js && node db/seed.js && node server.js
```

deploy once, then **put it back to `node server.js`** - otherwise every future
deploy wipes the database.

Confirm with `GET /api/health`: `schema` flips from `not-migrated` to `ready`.

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
