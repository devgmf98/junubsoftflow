# JunubSoftFlow API — container image for Railway.
#
# The build context is the REPOSITORY ROOT (railway.json points here with
# dockerfilePath: backend/Dockerfile), so every path below is root-relative.
# That matters: a bare `COPY package.json` would pick up the root workspace
# manifest, whose build script builds the front end - which is what made the
# Nixpacks build fail with "vite: not found".
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
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

# Uploads land here. On Railway this path should be a mounted volume - a container
# filesystem is ephemeral, so without one every APK and source bundle is lost on the
# next deploy. See DEPLOY.md.
RUN mkdir -p storage/apk storage/files storage/images storage/tmp

# node:20-alpine ships an unprivileged `node` user; run as it rather than root.
RUN chown -R node:node /app
USER node

EXPOSE 4000

# Railway sets PORT; server.js honours it and binds 0.0.0.0.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
