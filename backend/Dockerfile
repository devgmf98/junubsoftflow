# JunubSoftFlow API — for a build whose context is THIS directory.
#
# There are two Dockerfiles on purpose, and they build the same image:
#
#   /Dockerfile         context = repository root   (COPY backend/...)
#   /backend/Dockerfile context = backend/          (COPY ./...)   <- this one
#
# Which applies depends on the service's Root Directory, a platform setting this
# repository cannot see. If it is blank the context is the repository root; if it is
# set to `backend` the context is this directory, and a Dockerfile at the repository
# root is outside it - along with frontend/, which is exactly what produced
# "/frontend/package.json: not found" from an auto-detected build plan.
#
# Keeping both means the deploy works either way. Nothing here builds the web
# client; Netlify does that from frontend/.

# ---------- dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app

# Manifests first so this layer is rebuilt only when dependencies change.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# tini reaps zombies and forwards SIGTERM, so a redeploy stops the app cleanly
# instead of waiting out a kill timeout.
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Uploads land here. On a hosted platform this path should be a mounted volume - a
# container filesystem is ephemeral, so without one every APK and source bundle is
# lost on the next deploy. See DEPLOY.md.
RUN mkdir -p storage/apk storage/files storage/images storage/tmp

# node:20-alpine ships an unprivileged `node` user; run as it rather than root.
RUN chown -R node:node /app
USER node

EXPOSE 4000

# The platform sets PORT; server.js honours it and binds 0.0.0.0.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
