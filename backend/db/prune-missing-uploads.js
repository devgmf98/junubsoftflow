'use strict';

/**
 * Finds database rows that point at uploaded files which are no longer on disk,
 * and optionally clears those references.
 *
 *   node db/prune-missing-uploads.js          # report only (default)
 *   node db/prune-missing-uploads.js --fix    # clear the dangling references
 *
 * Why this exists: a container filesystem is erased on every deploy. Until a
 * volume was attached, every upload survived only until the next one - while its
 * row stayed behind, pointing at a filename that no longer resolves. On a product
 * card that is a broken-image glyph; in the admin it is a download that 404s.
 *
 * Clearing the reference does not bring the file back. It makes the app show what
 * it shows for a product that never had a picture - the tinted icon - so the site
 * looks intact while the files are re-uploaded.
 *
 * ATTACH THE VOLUME FIRST. Run this before storage is persistent and the same rows
 * will be dangling again after the next deploy.
 */

require('dotenv').config();
const db = require('../src/db');
const { apkPath, filePath, imagePath } = require('../src/upload');
const { storageStatus } = require('../src/upload');

const FIX = process.argv.includes('--fix');

/** One thing to check: where the names live, and how to clear a broken one. */
const TARGETS = [
  {
    label: 'product images',
    exists: imagePath,
    async find() {
      const rows = await db.query('SELECT id, name, image FROM products WHERE image IS NOT NULL');
      return rows.map((r) => ({ id: r.id, file: r.image, what: r.name }));
    },
    clear: (id) => db.run('UPDATE products SET image = NULL WHERE id = ?', [id]),
  },
  {
    label: 'product preview images',
    exists: imagePath,
    async find() {
      const rows = await db.query(
        `SELECT pi.id, pi.file_name, p.name FROM product_images pi
         LEFT JOIN products p ON p.id = pi.product_id`
      );
      return rows.map((r) => ({ id: r.id, file: r.file_name, what: r.name }));
    },
    clear: (id) => db.run('DELETE FROM product_images WHERE id = ?', [id]),
  },
  {
    label: 'buyer downloads',
    exists: filePath,
    async find() {
      const rows = await db.query(
        'SELECT id, label, file_name FROM product_files WHERE file_name IS NOT NULL'
      );
      return rows.map((r) => ({ id: r.id, file: r.file_name, what: r.label }));
    },
    clear: (id) => db.run('DELETE FROM product_files WHERE id = ?', [id]),
  },
  {
    label: 'demo Android builds',
    exists: apkPath,
    async find() {
      const rows = await db.query('SELECT id, title, apk_file FROM demos WHERE apk_file IS NOT NULL');
      return rows.map((r) => ({ id: r.id, file: r.apk_file, what: r.title }));
    },
    clear: (id) =>
      db.run(
        'UPDATE demos SET apk_file = NULL, apk_name = NULL, apk_size = NULL, apk_uploaded_at = NULL WHERE id = ?',
        [id]
      ),
  },
  {
    label: 'demo iOS builds',
    exists: apkPath,
    async find() {
      const rows = await db.query('SELECT id, title, ios_file FROM demos WHERE ios_file IS NOT NULL');
      return rows.map((r) => ({ id: r.id, file: r.ios_file, what: r.title }));
    },
    clear: (id) =>
      db.run(
        'UPDATE demos SET ios_file = NULL, ios_name = NULL, ios_size = NULL, ios_uploaded_at = NULL WHERE id = ?',
        [id]
      ),
  },
];

/** Review photos are a JSON array per row, so they are pruned entry by entry. */
async function reviewImages() {
  const rows = await db.query('SELECT id, images FROM reviews WHERE images IS NOT NULL');
  const broken = [];

  for (const row of rows) {
    let names = row.images;
    if (typeof names === 'string') {
      try {
        names = JSON.parse(names);
      } catch {
        continue;
      }
    }
    if (!Array.isArray(names)) continue;

    const kept = names.filter((n) => imagePath(n));
    if (kept.length !== names.length) {
      broken.push({ id: row.id, missing: names.filter((n) => !imagePath(n)), kept });
    }
  }
  return broken;
}

async function main() {
  const storage = storageStatus();
  console.log(`storage: ${storage.root}`);
  console.log(
    `         ${storage.volume ? 'on a persistent volume' : 'NOT on a volume - files here do not survive a deploy'}` +
      `, holding ${Object.values(storage.counts).reduce((n, v) => n + (v || 0), 0)} files`
  );
  console.log(`database: ${db.config.database}@${db.config.host}`);
  console.log(FIX ? 'mode: --fix, dangling references will be cleared\n' : 'mode: report only (pass --fix to clear)\n');

  let total = 0;

  for (const target of TARGETS) {
    const rows = await target.find();
    const missing = rows.filter((r) => r.file && !target.exists(r.file));
    total += missing.length;

    console.log(`${target.label}: ${rows.length} recorded, ${missing.length} missing from disk`);
    for (const row of missing) {
      console.log(`   #${row.id} ${row.what || ''} -> ${row.file}`);
      if (FIX) await target.clear(row.id);
    }
  }

  const reviews = await reviewImages();
  total += reviews.reduce((n, r) => n + r.missing.length, 0);
  console.log(`review photos: ${reviews.length} review(s) reference a missing file`);
  for (const r of reviews) {
    console.log(`   review #${r.id} -> ${r.missing.join(', ')}`);
    if (FIX) {
      await db.run('UPDATE reviews SET images = ? WHERE id = ?', [
        r.kept.length ? JSON.stringify(r.kept) : null,
        r.id,
      ]);
    }
  }

  console.log('');
  if (!total) {
    console.log('nothing dangling - every recorded file is on disk.');
  } else if (FIX) {
    console.log(`cleared ${total} dangling reference(s). Re-upload the files that matter.`);
  } else {
    console.log(`${total} dangling reference(s). Re-run with --fix to clear them.`);
    if (!storage.volume) {
      console.log('attach the volume first, or the next deploy puts you right back here.');
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
