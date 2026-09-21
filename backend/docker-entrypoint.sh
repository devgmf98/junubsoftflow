#!/bin/sh
set -e

# A mounted volume arrives owned by root, and the API runs as the unprivileged
# `node` user. Without this, a deploy that looks perfectly healthy rejects every
# upload with EACCES - so take ownership of the storage tree while we are still
# root, then drop privileges for the app itself.
#
# STORAGE_DIR wins, then Railway's own RAILWAY_VOLUME_MOUNT_PATH (set as soon as a
# volume is attached), matching the order src/upload.js resolves.
STORAGE="${STORAGE_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/app/storage}}"

mkdir -p "$STORAGE/apk" "$STORAGE/files" "$STORAGE/images" "$STORAGE/tmp"
if ! chown -R node:node "$STORAGE" 2>/dev/null; then
  echo "entrypoint: could not take ownership of $STORAGE - uploads may fail" >&2
fi

exec su-exec node "$@"
