'use strict';

/**
 * File uploads for the admin console.
 *  - APK builds attached to a demo  -> storage/apk
 *  - Installers attached to a product -> storage/files
 *
 * Nothing lands in /public: downloads go through routes that check entitlement
 * and record who pulled the file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const STORAGE = path.join(__dirname, '..', 'storage');
const APK_DIR = path.join(STORAGE, 'apk');
const FILE_DIR = path.join(STORAGE, 'files');
const IMAGE_DIR = path.join(STORAGE, 'images');

const MB = 1024 * 1024;
const envMb = (key, fallback) => {
  const n = Number(process.env[key]);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * MB;
};

// Real installers, APKs and source archives run to gigabytes, so these are ceilings
// rather than working limits. Override in .env with MAX_APK_MB / MAX_FILE_MB.
const MAX_APK_BYTES = envMb('MAX_APK_MB', 2048); // 2 GB
const MAX_FILE_BYTES = envMb('MAX_FILE_MB', 4096); // 4 GB

// A folder is zipped in one pass, so its parts are read back into memory. That is
// the one path with a real memory cost, so it keeps a separate, smaller ceiling.
const MAX_BUNDLE_TOTAL_BYTES = envMb('MAX_BUNDLE_TOTAL_MB', 1024); // 1 GB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REVIEW_IMAGES = 6;

fs.mkdirSync(APK_DIR, { recursive: true });
fs.mkdirSync(FILE_DIR, { recursive: true });
fs.mkdirSync(IMAGE_DIR, { recursive: true });

function safeName(original, fallback = 'build') {
  return (
    path
      .basename(original, path.extname(original))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || fallback
  );
}

function makeStorage(dir, keepExt) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = keepExt ? path.extname(file.originalname).toLowerCase() : '.apk';
      const rand = crypto.randomBytes(4).toString('hex');
      cb(null, `${safeName(file.originalname)}-${Date.now()}-${rand}${ext}`);
    },
  });
}

/* ---------------- mobile build uploads ---------------- */
/**
 * A demo's mobile build: .apk for Android, .ipa for iOS. Both are zip containers
 * and browsers label them inconsistently, so the extension decides and the MIME
 * type is only checked for something obviously wrong.
 *
 * The database columns are still named apk_*. Renaming them would mean retyping
 * live columns, which the boot-time schema sync deliberately will not do - so the
 * names stayed and the meaning widened.
 */
const MOBILE_EXT = new Set(['.apk', '.ipa']);

const APK_MIME = new Set([
  'application/vnd.android.package-archive',
  'application/x-itunes-ipa',
  'application/x-ios-app',
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
  '',
]);

const MOBILE_MIME = {
  '.apk': 'application/vnd.android.package-archive',
  // there is no registered type for an .ipa; octet-stream is what Apple serves
  '.ipa': 'application/octet-stream',
};

/** Content type for a stored build, from its extension. */
const buildMime = (name) => MOBILE_MIME[path.extname(String(name || '')).toLowerCase()] || 'application/octet-stream';

/**
 * What the browser should save a build as: the name the admin uploaded, or the
 * demo's slug carrying the stored extension - never a hard-coded .apk, which is
 * how an iOS build ends up on disk as an Android one.
 */
const buildFileName = (stored, original, slug) =>
  original || `${slug}${path.extname(String(stored || '')) || '.apk'}`;

function apkFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!MOBILE_EXT.has(ext)) {
    const err = new Error('Upload an Android .apk or an iOS .ipa build.');
    err.status = 400;
    err.code = 'LIMIT_FILE_TYPE';
    return cb(err);
  }
  if (!APK_MIME.has(file.mimetype)) {
    const err = new Error(`Unexpected file type "${file.mimetype}". Upload the .apk or .ipa build.`);
    err.status = 400;
    err.code = 'LIMIT_FILE_TYPE';
    return cb(err);
  }
  cb(null, true);
}

// keepExt, now that the filter guarantees it is one of two: an .ipa saved as
// .apk downloads as a file no phone will open.
const uploadApk = multer({
  storage: makeStorage(APK_DIR, true),
  fileFilter: apkFilter,
  limits: { fileSize: MAX_APK_BYTES, files: 1 },
}).single('apk');

/* ---------------- installer uploads ---------------- */
const ALLOWED_EXT = new Set(['.apk', '.exe', '.msi', '.dmg', '.pkg', '.zip', '.gz', '.tgz', '.iso', '.deb', '.rpm', '.appimage']);

function installerFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error(`"${ext || 'that file type'}" is not an accepted installer format.`);
    err.status = 400;
    err.code = 'LIMIT_FILE_TYPE';
    return cb(err);
  }
  cb(null, true);
}

const uploadInstaller = multer({
  storage: makeStorage(FILE_DIR, true),
  fileFilter: installerFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
}).single('file');

/**
 * Source-code / asset bundles. The admin can pick a whole folder (the browser
 * sends every file with its relative path) or several loose files; anything with
 * more than one file is zipped server-side into a single downloadable archive.
 *
 * Held in memory because the parts are recombined before anything is written.
 */
const MAX_BUNDLE_FILES = 300;
const TMP_DIR = path.join(STORAGE, 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

// Streams every part to a temp file. memoryStorage held whole uploads in RAM, which
// capped a "500 MB" limit well below 500 MB in practice and crashed the process
// rather than rejecting the upload.
const uploadBundle = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) =>
      cb(null, `up-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_BUNDLE_FILES },
}).array('files', MAX_BUNDLE_FILES);

/** Removes the temp parts once they have been stored or rejected. */
function cleanupParts(files = []) {
  for (const f of files) {
    if (f && f.path) {
      try {
        fs.unlinkSync(f.path);
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * Turns whatever the admin selected into one stored file.
 * A single archive is kept as-is; anything else is zipped, preserving folder paths.
 *
 * multer (via busboy) strips directory components from the upload filename, so the
 * client sends the relative paths separately in a `paths` field, positionally.
 *
 * @param {Array} files    multer in-memory files
 * @param {string} label   used for the stored/download filename
 * @param {string[]} paths relative path per file, same order as `files`
 * @returns {{fileName, originalName, size, bundled: boolean, entryCount: number}}
 */
function storeBundle(files, label, paths = []) {
  const { makeZip } = require('./placeholder');

  const slug =
    String(label || 'bundle')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'bundle';
  const rand = crypto.randomBytes(4).toString('hex');

  // One file that is already an archive: move it into place. No size ceiling beyond
  // multer's, because nothing is ever read into memory.
  if (files.length === 1 && ARCHIVE_EXT.has(path.extname(files[0].originalname).toLowerCase())) {
    const ext = path.extname(files[0].originalname).toLowerCase();
    const fileName = `${slug}-${Date.now()}-${rand}${ext}`;
    moveInto(files[0], path.join(FILE_DIR, fileName));
    return {
      fileName,
      originalName: files[0].originalname,
      size: files[0].size,
      bundled: false,
      entryCount: 1,
    };
  }

  // Zipping needs the parts in memory, so this is where the aggregate cap applies.
  const total = files.reduce((n, f) => n + (f.size || 0), 0);
  if (total > MAX_BUNDLE_TOTAL_BYTES) {
    cleanupParts(files);
    const err = new Error(
      `That folder is ${(total / MB / 1024).toFixed(1)} GB. Folders are zipped in one pass, so ` +
        `they are capped at ${Math.round(MAX_BUNDLE_TOTAL_BYTES / MB)} MB - zip it yourself and ` +
        'upload the .zip instead, which has no such limit.'
    );
    err.status = 413;
    throw err;
  }

  // otherwise bundle everything into one zip, keeping the folder structure
  const seen = new Set();
  const entries = files.map((f, i) => {
    let name = safeEntryName(paths[i] || f.originalname);
    // never let two parts collide inside the archive
    while (seen.has(name)) {
      const ext = path.extname(name);
      name = `${name.slice(0, name.length - ext.length)}-${seen.size}${ext}`;
    }
    seen.add(name);
    return { name, data: f.buffer || fs.readFileSync(f.path) };
  });

  const zip = makeZip(entries);
  const fileName = `${slug}-${Date.now()}-${rand}.zip`;
  fs.writeFileSync(path.join(FILE_DIR, fileName), zip);
  cleanupParts(files);

  return {
    fileName,
    originalName: `${slug}.zip`,
    size: zip.length,
    bundled: true,
    entryCount: entries.length,
  };
}

const ARCHIVE_EXT = new Set(['.zip', '.gz', '.tgz', '.rar', '.7z']);

/** Rename where possible; fall back to a stream copy across devices. */
function moveInto(file, dest) {
  if (file.buffer) {
    fs.writeFileSync(dest, file.buffer);
    return;
  }
  try {
    fs.renameSync(file.path, dest);
  } catch {
    fs.copyFileSync(file.path, dest);
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* already gone */
    }
  }
}

/** Keeps folder structure but strips anything that could escape the archive root. */
function safeEntryName(name) {
  return String(name || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
    .slice(0, 200) || 'file';
}

/* ---------------- review image uploads ---------------- */
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function imageFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!IMAGE_EXT.has(ext) || !file.mimetype.startsWith('image/')) {
    const err = new Error('Review images must be PNG, JPG, WebP, GIF or SVG.');
    err.status = 400;
    err.code = 'LIMIT_FILE_TYPE';
    return cb(err);
  }
  cb(null, true);
}

const uploadReviewImages = multer({
  storage: makeStorage(IMAGE_DIR, true),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_REVIEW_IMAGES },
}).array('images', MAX_REVIEW_IMAGES);

/** Preview screenshots shown in the storefront product slider. */
const MAX_PRODUCT_IMAGES = 12;
const uploadProductImages = multer({
  storage: makeStorage(IMAGE_DIR, true),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_PRODUCT_IMAGES },
}).array('images', MAX_PRODUCT_IMAGES);

/** The single main product image shown on cards and the product page. */
const uploadProductImage = multer({
  storage: makeStorage(IMAGE_DIR, true),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('image');

/** Content-type for a stored image, from its extension. */
function imageMime(filename) {
  return IMAGE_MIME[path.extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

/* ---------------- helpers ---------------- */
function removeFrom(dir, filename) {
  if (!filename) return;
  fs.promises.unlink(path.join(dir, path.basename(filename))).catch(() => {});
}

function existsIn(dir, filename) {
  if (!filename) return null;
  const target = path.join(dir, path.basename(filename));
  return fs.existsSync(target) ? target : null;
}

const removeApk = (f) => removeFrom(APK_DIR, f);
const removeFile = (f) => removeFrom(FILE_DIR, f);
const removeImage = (f) => removeFrom(IMAGE_DIR, f);
const apkPath = (f) => existsIn(APK_DIR, f);
const filePath = (f) => existsIn(FILE_DIR, f);
const imagePath = (f) => existsIn(IMAGE_DIR, f);

module.exports = {
  uploadApk,
  buildMime,
  buildFileName,
  MOBILE_EXT,
  uploadInstaller,
  uploadBundle,
  uploadReviewImages,
  uploadProductImages,
  uploadProductImage,
  storeBundle,
  removeApk,
  removeFile,
  removeImage,
  apkPath,
  filePath,
  imagePath,
  imageMime,
  APK_DIR,
  FILE_DIR,
  IMAGE_DIR,
  MAX_APK_BYTES,
  MAX_FILE_BYTES,
  MAX_BUNDLE_TOTAL_BYTES,
  cleanupParts,
  MAX_IMAGE_BYTES,
  MAX_REVIEW_IMAGES,
  MAX_PRODUCT_IMAGES,
  MAX_BUNDLE_FILES,
};
