# JunubSoftFlow API — container image for Railway.
#
# This lives at the REPOSITORY ROOT on purpose. Railway's current builder, Railpack,
# does not read railway.json's dockerfilePath or nixpacks.toml - it auto-detects the
# project and generates its own plan. A Dockerfile at the root is what it looks for,
# and finding one it uses it instead of guessing.
#
# Guessing is what kept failing: Railpack read the root package.json, saw a workspace
# and generated COPY steps for frontend/package.json, which is not something the API
# image needs at all.
#
# Paths are root-relative because the context is the repository root. A bare
# `COPY package.json` would pick up the root workspace manifest, whose build script
# builds the front end - the original "vite: not found".
#
# Nothing here builds the front end. Netlify does that. This image is the API.

# ---------- dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app

# Manifests first so this layer is rebuilt only when dependencies change.
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# tini reaps zombies and forwards SIGTERM, so a redeploy stops the app cleanly
# instead of waiting out a kill timeout.
RUN apk add --no-cache tini su-exec

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

# Uploads land here. On Railway this path should be a mounted volume - a container
# filesystem is ephemeral, so without one every image, APK and source bundle is lost
# on the next deploy. See DEPLOY.md.
RUN mkdir -p storage/apk storage/files storage/images storage/tmp

# node:20-alpine ships an unprivileged `node` user; the app runs as it. The
# entrypoint stays root just long enough to take ownership of the storage volume,
# which is mounted root-owned, then drops to `node` via su-exec.
RUN chown -R node:node /app
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000

# Railway sets PORT; server.js honours it and binds 0.0.0.0.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
