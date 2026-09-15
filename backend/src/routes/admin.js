'use strict';

/** Admin API: dashboard, products, orders, customers, categories, reports, settings, roles, demos. */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const store = require('../store');
const mailer = require('../mailer');
const { requireAdmin, asyncRoute } = require('../middleware/auth');
const {
  uploadApk, uploadInstaller, uploadBundle, uploadProductImages, uploadProductImage, storeBundle,
  removeApk, removeFile, removeImage, apkPath, filePath, buildMime, buildFileName,
  uploadIpa, uploadDemoBuilds,
  MAX_APK_BYTES, MAX_FILE_BYTES,
  MAX_BUNDLE_TOTAL_BYTES,
  cleanupParts, MAX_PRODUCT_IMAGES, MAX_BUNDLE_FILES,
} = require('../upload');

/** The store name as a filename fragment, e.g. "JunubSoftFlow" -> "junubsoftflow". */
async function nameSlug() {
  const name = await mailer.siteName();
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'store';
}

const router = express.Router();
router.use(requireAdmin);

const PER_PAGE = 12;

function pageParams(req, total, perPage = PER_PAGE) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), pages);
  return { page, pages, perPage, total, offset: (page - 1) * perPage };
}

function slugify(value, fallback = 'item') {
  const s = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return s || fallback;
}

async function uniqueSlug(table, base) {
  if (await db.one(`SELECT id FROM ${table} WHERE slug = ?`, [base])) {
    return `${base}-${Date.now().toString(36)}`;
  }
  return base;
}

/** Blank is allowed; anything else must be an http(s) URL. */
function cleanUrl(value) {
  const v = String(value || '').trim();
  if (!v) return { ok: true, value: null };
  if (!/^https?:\/\/\S+$/i.test(v)) return { ok: false, value: v };
  return { ok: true, value: v.slice(0, 500) };
}

/** Wraps a multer middleware so it can be awaited inside an async handler. */
const MB = 1024 * 1024;

function runUpload(mw, req, res) {
  return new Promise((resolve, reject) => {
    mw(req, res, (err) => {
      if (!err) return resolve();
      // multer says only "File too large" - say which limit was hit and what it is
      if (err.code === 'LIMIT_FILE_SIZE') {
        err.message =
          `That file is over the ${Math.round(MAX_FILE_BYTES / MB)} MB per-file limit. ` +
          'Raise MAX_FILE_MB in the server .env if you need more.';
        err.status = 413;
      } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        err.message = 'That folder has too many files. Zip it first and upload the archive.';
        err.status = 413;
      }
      reject(err);
    });
  });
}

/* ================= 1. dashboard ================= */
router.get(
  '/dashboard',
  asyncRoute(async (req, res) => {
    const [revenue, prevRevenue, orders, prevOrders, customers, prevCustomers, products, newMessages, pendingOrders] =
      await Promise.all([
        db.scalar("SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE payment_status = 'paid'"),
        db.scalar(
          "SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE payment_status = 'paid' AND created_at < DATE_SUB(CURDATE(), INTERVAL 1 MONTH)"
        ),
        db.scalar('SELECT COUNT(*) AS v FROM orders'),
        db.scalar('SELECT COUNT(*) AS v FROM orders WHERE created_at < DATE_SUB(CURDATE(), INTERVAL 1 MONTH)'),
        db.scalar("SELECT COUNT(*) AS v FROM users WHERE role = 'customer' AND status = 'active'"),
        db.scalar(
          "SELECT COUNT(*) AS v FROM users WHERE role = 'customer' AND created_at < DATE_SUB(CURDATE(), INTERVAL 1 MONTH)"
        ),
        db.scalar("SELECT COUNT(*) AS v FROM products WHERE status = 'active'"),
        db.scalar("SELECT COUNT(*) AS v FROM contact_messages WHERE status = 'new'"),
        db.scalar("SELECT COUNT(*) AS v FROM orders WHERE status IN ('pending','processing')"),
      ]);

    const monthly = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, SUM(total) AS total
       FROM orders WHERE payment_status = 'paid' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       GROUP BY ym ORDER BY ym`
    );

    const [recentOrders, topProducts, activity, lowStock] = await Promise.all([
      db.query(
        `SELECT o.*, (SELECT GROUP_CONCAT(oi.product_name SEPARATOR ', ')
                      FROM order_items oi WHERE oi.order_id = o.id) AS items
         FROM orders o ORDER BY o.created_at DESC LIMIT 5`
      ),
      db.query(
        `SELECT p.name, p.icon, p.accent, COALESCE(SUM(oi.quantity),0) AS units,
                COALESCE(SUM(oi.line_total),0) AS revenue
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id
         LEFT JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid'
         GROUP BY p.id ORDER BY revenue DESC LIMIT 5`
      ),
      db.query(
        `SELECT a.*, u.name AS user_name FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 6`
      ),
      db.query("SELECT id, name, stock FROM products WHERE status = 'active' AND stock < 40 ORDER BY stock LIMIT 5"),
    ]);

    const topTotal = topProducts.reduce((s, p) => s + Number(p.revenue), 0);

    res.json({
      kpis: {
        revenue: Number(revenue),
        revenueGrowth: store.growth(revenue, prevRevenue),
        orders: Number(orders),
        orderGrowth: store.growth(orders, prevOrders),
        customers: Number(customers),
        customerGrowth: store.growth(customers, prevCustomers),
        products: Number(products),
      },
      badges: { newMessages: Number(newMessages), pendingOrders: Number(pendingOrders) },
      series: store.fillMonths(monthly),
      recentOrders: recentOrders.map((o) => ({
        id: o.id, orderNumber: o.order_number, customerName: o.customer_name,
        items: o.items, total: Number(o.total), status: o.status, createdAt: o.created_at,
      })),
      topProducts: topProducts.map((p) => ({
        name: p.name, icon: p.icon, accent: p.accent,
        units: Number(p.units), revenue: Number(p.revenue),
        share: topTotal ? Math.round((Number(p.revenue) / topTotal) * 100) : 0,
      })),
      activity: activity.map((a) => ({
        id: a.id, type: a.type, message: a.message, userName: a.user_name, createdAt: a.created_at,
      })),
      lowStock: lowStock.map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
    });
  })
);

/* ================= 2. products ================= */
/** How each client-facing key maps onto a column, and how it is cleaned. */
const PRODUCT_FIELDS = {
  name: ['name', (v) => String(v || '').trim()],
  categoryId: ['category_id', (v) => (v ? Number(v) : null)],
  vendor: ['vendor', (v) => String(v || '').trim() || null],
  shortDesc: ['short_desc', (v) => String(v || '').trim() || null],
  description: ['description', (v) => String(v || '').trim() || null],
  price: ['price', (v) => Math.max(0, Number(v) || 0)],
  pricingMode: ['pricing_mode', (v) => (v === 'packages' ? 'packages' : 'simple')],
  comparePrice: ['compare_price', (v) => (v ? Math.max(0, Number(v)) : null)],
  // clamped here as well as in store.salePrice - a typo of 500 must not give the
  // product away, and the stored value is what the storefront trusts
  discountPercent: ['discount_percent', (v) => Math.min(95, Math.max(0, Number(v) || 0))],
  // the campaign this belongs to - "Black Friday", "Launch offer" - so a shopper
  // sees why the price dropped rather than just that it did
  discountLabel: ['discount_label', (v) => String(v || '').trim().slice(0, 60) || null],
  // a discount can be live on the storefront without being emailed out - a quiet price
  // cut is a normal thing to want
  announceDiscount: ['announce_discount', (v) => (v === false || v === 0 || v === '0' ? 0 : 1)],
  stock: ['stock', (v) => Math.max(0, parseInt(v, 10) || 0)],
  licenceTerm: ['licence_term', (v) => String(v || '').trim() || null],
  platforms: ['platforms', (v) => String(v || '').trim() || null],
  badge: ['badge', (v) => String(v || '').trim() || null],
  icon: ['icon', (v) => String(v || 'box').trim()],
  accent: ['accent', (v) => String(v || 'blue').trim()],
  isFeatured: ['is_featured', (v) => (v ? 1 : 0)],
  status: ['status', (v) => (['active', 'draft', 'archived'].includes(v) ? v : 'active')],
};

/**
 * Reads product columns out of a request body.
 * SKU is always derived by the server, so anything the client sends is ignored.
 *
 * `partial` keeps only the keys the caller actually supplied, so a PATCH-style
 * update cannot blank out fields it never mentioned.
 */
function productFields(body, { partial = false } = {}) {
  const out = {};
  for (const [key, [column, clean]] of Object.entries(PRODUCT_FIELDS)) {
    if (partial && !Object.prototype.hasOwnProperty.call(body, key)) continue;
    out[column] = clean(body[key]);
  }
  return out;
}

async function saveFeatures(productId, list) {
  const labels = (Array.isArray(list) ? list : String(list || '').split('\n'))
    .map((l) => String(l).trim())
    .filter(Boolean)
    .slice(0, 12);
  await db.run('DELETE FROM product_features WHERE product_id = ?', [productId]);
  for (let i = 0; i < labels.length; i++) {
    await db.run('INSERT INTO product_features (product_id, label, sort_order) VALUES (?, ?, ?)', [
      productId, labels[i], i + 1,
    ]);
  }
}

router.get(
  '/products',
  asyncRoute(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const categoryId = String(req.query.category || '');
    const status = String(req.query.status || '');

    let where = 'WHERE 1 = 1';
    const params = [];
    if (search) {
      where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.vendor LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (/^\d+$/.test(categoryId)) {
      where += ' AND p.category_id = ?';
      params.push(Number(categoryId));
    }
    if (['active', 'draft', 'archived'].includes(status)) {
      where += ' AND p.status = ?';
      params.push(status);
    }

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM products p ${where}`, params));
    const pg = pageParams(req, total);

    const rows = await db.query(
      `SELECT p.*, c.name AS category_name,
              (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.product_id = p.id) AS sold,
              (SELECT COUNT(*) FROM product_files f WHERE f.product_id = p.id) AS file_count
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${where} ORDER BY p.sort_order, p.id LIMIT ${pg.perPage} OFFSET ${pg.offset}`,
      params
    );

    res.json({
      licenceTerms: await store.licenceTerms(),
      products: rows.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, sku: p.sku, vendor: p.vendor,
        shortDesc: p.short_desc, description: p.description,
        price: Number(p.price), pricingMode: p.pricing_mode,
        comparePrice: p.compare_price === null ? null : Number(p.compare_price),
        discountPercent: store.productDiscount(p), salePrice: store.salePrice(p),
        discountLabel: p.discount_label,
        announceDiscount: Boolean(p.announce_discount),
        stock: p.stock, licenceTerm: p.licence_term, platforms: p.platforms, badge: p.badge,
        icon: p.icon, accent: p.accent, rating: Number(p.rating), reviewCount: p.review_count,
        imageUrl: p.image ? `/api/shop/review-images/${encodeURIComponent(p.image)}` : null,
        isFeatured: Boolean(p.is_featured), status: p.status,
        categoryId: p.category_id, categoryName: p.category_name,
        sold: Number(p.sold), fileCount: Number(p.file_count),
      })),
      ...pg,
    });
  })
);

router.get(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const p = await db.one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Product not found.' });

    const [features, sold] = await Promise.all([
      db.query('SELECT label FROM product_features WHERE product_id = ? ORDER BY sort_order', [p.id]),
      db.scalar('SELECT COUNT(*) AS v FROM order_items WHERE product_id = ?', [p.id]),
    ]);

    res.json({
      product: {
        skuLocked: Number(sold) > 0,
        id: p.id, name: p.name, slug: p.slug, sku: p.sku, vendor: p.vendor,
        shortDesc: p.short_desc, description: p.description,
        price: Number(p.price), comparePrice: p.compare_price === null ? null : Number(p.compare_price),
        discountPercent: store.productDiscount(p), salePrice: store.salePrice(p),
        discountLabel: p.discount_label,
        announceDiscount: Boolean(p.announce_discount),
        stock: p.stock, licenceTerm: p.licence_term, platforms: p.platforms, badge: p.badge,
        icon: p.icon, accent: p.accent, isFeatured: Boolean(p.is_featured), status: p.status,
        imageUrl: p.image ? `/api/shop/review-images/${encodeURIComponent(p.image)}` : null,
        categoryId: p.category_id,
        features: features.map((f) => f.label),
      },
    });
  })
);

router.post(
  '/products',
  asyncRoute(async (req, res) => {
    const f = productFields(req.body);
    if (!f.name) return res.status(400).json({ error: 'A product needs a name.' });

    f.sku = await store.uniqueSku(f.name);
    const slug = await uniqueSlug('products', slugify(req.body.slug || f.name, 'product'));
    const sortOrder = Number(await db.scalar('SELECT COALESCE(MAX(sort_order),0) + 1 AS v FROM products'));

    const result = await db.run(
      `INSERT INTO products (name, slug, category_id, sku, vendor, short_desc, description, price, compare_price,
                             stock, licence_term, platforms, badge, icon, accent, is_featured, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.name, slug, f.category_id, f.sku, f.vendor, f.short_desc, f.description, f.price, f.compare_price,
       f.stock, f.licence_term, f.platforms, f.badge, f.icon, f.accent, f.is_featured, f.status, sortOrder]
    );

    await saveFeatures(result.insertId, req.body.features);
    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "product", ?)', [
      req.session.user.id, `Product created: ${f.name}`,
    ]);

    res.status(201).json({ id: result.insertId, sku: f.sku });
  })
);

router.put(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // only the fields the caller sent, so a partial update leaves the rest alone
    const f = productFields(req.body, { partial: true });
    if ('name' in f && !f.name) return res.status(400).json({ error: 'A product needs a name.' });

    const name = f.name ?? product.name;

    // Follow a rename, but freeze the SKU once an order references this product,
    // so historical paperwork keeps pointing at the code it was placed under.
    const sold = Number(
      await db.scalar('SELECT COUNT(*) AS v FROM order_items WHERE product_id = ?', [product.id])
    );
    f.sku =
      sold > 0 || name === product.name ? product.sku : await store.uniqueSku(name, product.id);

    const columns = Object.keys(f);
    if (columns.length) {
      await db.run(
        `UPDATE products SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => f[c]), product.id]
      );
    }

    if (req.body.features !== undefined) await saveFeatures(product.id, req.body.features);

    res.json({ ok: true, sku: f.sku, skuLocked: sold > 0 });
  })
);

router.delete(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT name FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

/* ---------- product downloads ---------- */
router.get(
  '/products/:id/files',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT id, name FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const [files, images] = await Promise.all([
      db.query(
        `SELECT f.*, pk.name AS package_name FROM product_files f
         LEFT JOIN packages pk ON pk.id = f.package_id
         WHERE f.product_id = ? ORDER BY f.id`,
        [product.id]
      ),
      db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [product.id]),
    ]);

    res.json({
      product: { id: product.id, name: product.name },
      maxFileMb: Math.round(MAX_FILE_BYTES / (1024 * 1024)),
      maxBundleTotalMb: Math.round(MAX_BUNDLE_TOTAL_BYTES / (1024 * 1024)),
      maxImages: MAX_PRODUCT_IMAGES,
      files: files.map((f) => ({
        id: f.id, label: f.label, kind: f.kind, platform: f.platform, version: f.version,
        packageId: f.package_id || null, packageName: f.package_name || null,
        originalName: f.original_name, size: f.file_size,
        externalUrl: f.external_url, requiresPurchase: Boolean(f.requires_purchase),
        downloadCount: f.download_count,
        missing: Boolean(f.file_name) && !filePath(f.file_name),
      })),
      images: images.map((i) => ({
        id: i.id,
        caption: i.caption,
        originalName: i.original_name,
        size: i.file_size,
        url: `/api/shop/review-images/${encodeURIComponent(i.file_name)}`,
      })),
    });
  })
);

router.post(
  '/products/:id/files',
  asyncRoute(async (req, res) => {
    await runUpload(uploadInstaller, req, res);

    const product = await db.one('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      if (req.file) removeFile(req.file.filename);
      return res.status(404).json({ error: 'Product not found.' });
    }

    const label = String(req.body.label || '').trim();
    const external = cleanUrl(req.body.externalUrl);

    if (!label) {
      if (req.file) removeFile(req.file.filename);
      return res.status(400).json({ error: 'Give the download a label.' });
    }
    if (!external.ok) {
      if (req.file) removeFile(req.file.filename);
      return res.status(400).json({ error: 'The external link must start with http:// or https://' });
    }
    if (!req.file && !external.value) {
      return res.status(400).json({ error: 'Upload a file or provide an external link.' });
    }

    const result = await db.run(
      `INSERT INTO product_files (product_id, label, platform, version, file_name, original_name,
                                  file_size, external_url, requires_purchase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        label,
        ['windows', 'mac', 'linux', 'android', 'ios', 'web'].includes(req.body.platform)
          ? req.body.platform : 'windows',
        String(req.body.version || '').trim() || null,
        req.file ? req.file.filename : null,
        req.file ? req.file.originalname : null,
        req.file ? req.file.size : null,
        external.value,
        String(req.body.requiresPurchase) === 'false' ? 0 : 1,
      ]
    );

    res.status(201).json({ id: result.insertId });
  })
);

router.delete(
  '/products/:id/files/:fileId',
  asyncRoute(async (req, res) => {
    const file = await db.one('SELECT * FROM product_files WHERE id = ? AND product_id = ?', [
      req.params.fileId, req.params.id,
    ]);
    if (!file) return res.status(404).json({ error: 'That download no longer exists.' });
    removeFile(file.file_name);
    await db.run('DELETE FROM product_files WHERE id = ?', [file.id]);
    res.json({ ok: true });
  })
);

/**
 * Attach a source-code folder, an APK, or any other build to a product.
 * Accepts a whole folder (many parts) or loose files; more than one is zipped
 * into a single archive, keeping the folder structure.
 */
router.post(
  '/products/:id/bundle',
  asyncRoute(async (req, res) => {
    await runUpload(uploadBundle, req, res);

    const files = req.files || [];

    const product = await db.one('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      cleanupParts(files);
      return res.status(404).json({ error: 'Product not found.' });
    }
    if (!files.length) return res.status(400).json({ error: 'Choose a folder or at least one file.' });

    const kind = ['installer', 'source', 'apk', 'document'].includes(req.body.kind)
      ? req.body.kind
      : 'source';
    const label =
      String(req.body.label || '').trim() ||
      (kind === 'source' ? 'Source code' : kind === 'apk' ? 'Android build' : 'Download');

    // relative paths arrive positionally; busboy strips them from the filenames
    const paths = Array.isArray(req.body.paths)
      ? req.body.paths
      : req.body.paths
      ? [req.body.paths]
      : [];

    const stored = storeBundle(files, label, paths);

    const result = await db.run(
      `INSERT INTO product_files (product_id, label, kind, platform, version, file_name, original_name,
                                  file_size, requires_purchase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        label,
        kind,
        ['windows', 'mac', 'linux', 'android', 'ios', 'web'].includes(req.body.platform)
          ? req.body.platform
          : kind === 'apk' ? 'android' : 'web',
        String(req.body.version || '').trim() || null,
        stored.fileName,
        stored.originalName,
        stored.size,
        // buyers only: this is the paid deliverable
        String(req.body.requiresPurchase) === 'false' ? 0 : 1,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      originalName: stored.originalName,
      size: stored.size,
      bundled: stored.bundled,
      entryCount: stored.entryCount,
    });
  })
);

/* ---------- pricing packages ---------- */
const SECTIONS = ['included', 'addons', 'benefits'];

/** Replaces a package's tick-lists with whatever the form sent. */
async function savePackageFeatures(packageId, body) {
  await db.run('DELETE FROM package_features WHERE package_id = ?', [packageId]);
  let order = 0;
  for (const section of SECTIONS) {
    const raw = body[section];
    const labels = (Array.isArray(raw) ? raw : String(raw || '').split('\n'))
      .map((l) => String(l).trim())
      .filter(Boolean)
      .slice(0, 20);
    for (const label of labels) {
      await db.run(
        'INSERT INTO package_features (package_id, section, label, included, sort_order) VALUES (?, ?, ?, 1, ?)',
        [packageId, section, label, ++order]
      );
    }
  }
}

function packageFields(body) {
  return {
    license_type: store.LICENSE_TYPES.includes(body.licenseType) ? body.licenseType : 'regular',
    name: String(body.name || '').trim(),
    tagline: String(body.tagline || '').trim() || null,
    price: Math.max(0, Number(body.price) || 0),
    compare_price: body.comparePrice ? Math.max(0, Number(body.comparePrice)) : null,
    license_count: Math.max(1, parseInt(body.licenseCount, 10) || 1),
    is_popular: body.isPopular ? 1 : 0,
    cta_label: String(body.ctaLabel || 'Buy Now').trim(),
    status: body.status === 'draft' ? 'draft' : 'active',
  };
}

router.get(
  '/products/:id/packages',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT id, name, pricing_mode FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const [packages, features, matrix, addons] = await Promise.all([
      db.query(
        `SELECT pk.*, (SELECT COUNT(*) FROM product_files f WHERE f.package_id = pk.id) AS file_count
         FROM packages pk WHERE pk.product_id = ? ORDER BY pk.sort_order, pk.id`,
        [product.id]
      ),
      db.query(
        `SELECT pf.* FROM package_features pf JOIN packages pk ON pk.id = pf.package_id
         WHERE pk.product_id = ? ORDER BY pf.sort_order, pf.id`,
        [product.id]
      ),
      db.query('SELECT * FROM license_features WHERE product_id = ? ORDER BY sort_order, id', [product.id]),
      db.query(
        `SELECT a.*, (SELECT COUNT(*) FROM product_files f WHERE f.addon_id = a.id) AS file_count
         FROM addons a WHERE a.product_id = ? ORDER BY a.sort_order, a.id`,
        [product.id]
      ),
    ]);

    const listFor = (id, section) =>
      features.filter((f) => f.package_id === id && f.section === section).map((f) => f.label);

    res.json({
      product: { id: product.id, name: product.name, pricingMode: product.pricing_mode },
      licenseTypes: store.LICENSE_TYPES,
      packages: packages.map((pk) => ({
        id: pk.id,
        licenseType: pk.license_type,
        name: pk.name,
        tagline: pk.tagline,
        price: Number(pk.price),
        comparePrice: pk.compare_price === null ? null : Number(pk.compare_price),
        licenseCount: pk.license_count,
        isPopular: Boolean(pk.is_popular),
        ctaLabel: pk.cta_label,
        status: pk.status,
        included: listFor(pk.id, 'included'),
        addons: listFor(pk.id, 'addons'),
        benefits: listFor(pk.id, 'benefits'),
        fileCount: Number(pk.file_count || 0),
      })),
      matrix: matrix.map((m) => ({
        id: m.id, licenseType: m.license_type, label: m.label, included: Boolean(m.included),
      })),
      addons: addons.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        regularPrice: a.regular_price === null ? null : Number(a.regular_price),
        extendedPrice: a.extended_price === null ? null : Number(a.extended_price),
        status: a.status,
        fileCount: Number(a.file_count || 0),
      })),
    });
  })
);

router.post(
  '/products/:id/packages',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const f = packageFields(req.body);
    if (!f.name) return res.status(400).json({ error: 'A package needs a name.' });

    const sortOrder = Number(
      await db.scalar('SELECT COALESCE(MAX(sort_order),0) + 1 AS v FROM packages WHERE product_id = ?', [
        product.id,
      ])
    );

    const result = await db.run(
      `INSERT INTO packages (product_id, license_type, name, tagline, price, compare_price,
                             license_count, is_popular, cta_label, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product.id, f.license_type, f.name, f.tagline, f.price, f.compare_price,
       f.license_count, f.is_popular, f.cta_label, f.status, sortOrder]
    );

    await savePackageFeatures(result.insertId, req.body);

    // only one "most popular" per licence type
    if (f.is_popular) {
      await db.run(
        'UPDATE packages SET is_popular = 0 WHERE product_id = ? AND license_type = ? AND id <> ?',
        [product.id, f.license_type, result.insertId]
      );
    }

    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/products/:id/packages/:packageId',
  asyncRoute(async (req, res) => {
    const pkg = await db.one('SELECT * FROM packages WHERE id = ? AND product_id = ?', [
      req.params.packageId, req.params.id,
    ]);
    if (!pkg) return res.status(404).json({ error: 'Package not found.' });

    const f = packageFields(req.body);
    if (!f.name) return res.status(400).json({ error: 'A package needs a name.' });

    await db.run(
      `UPDATE packages SET license_type = ?, name = ?, tagline = ?, price = ?, compare_price = ?,
                           license_count = ?, is_popular = ?, cta_label = ?, status = ?
       WHERE id = ?`,
      [f.license_type, f.name, f.tagline, f.price, f.compare_price,
       f.license_count, f.is_popular, f.cta_label, f.status, pkg.id]
    );

    await savePackageFeatures(pkg.id, req.body);

    if (f.is_popular) {
      await db.run(
        'UPDATE packages SET is_popular = 0 WHERE product_id = ? AND license_type = ? AND id <> ?',
        [pkg.product_id, f.license_type, pkg.id]
      );
    }

    res.json({ ok: true });
  })
);

router.delete(
  '/products/:id/packages/:packageId',
  asyncRoute(async (req, res) => {
    const pkg = await db.one('SELECT id FROM packages WHERE id = ? AND product_id = ?', [
      req.params.packageId, req.params.id,
    ]);
    if (!pkg) return res.status(404).json({ error: 'Package not found.' });
    await db.run('DELETE FROM packages WHERE id = ?', [pkg.id]);
    res.json({ ok: true });
  })
);

/* ---------- licence comparison matrix ---------- */
router.put(
  '/products/:id/license-matrix',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    await db.run('DELETE FROM license_features WHERE product_id = ?', [product.id]);

    // rows arrive as [{ licenseType, label, included }]
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 60) : [];
    let order = 0;
    for (const r of rows) {
      const label = String(r.label || '').trim();
      if (!label) continue;
      await db.run(
        'INSERT INTO license_features (product_id, license_type, label, included, sort_order) VALUES (?, ?, ?, ?, ?)',
        [
          product.id,
          store.LICENSE_TYPES.includes(r.licenseType) ? r.licenseType : 'regular',
          label,
          r.included ? 1 : 0,
          ++order,
        ]
      );
    }
    res.json({ ok: true, rows: order });
  })
);

/* ---------- premium add-ons ---------- */
router.post(
  '/products/:id/addons',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'An add-on needs a name.' });

    const sortOrder = Number(
      await db.scalar('SELECT COALESCE(MAX(sort_order),0) + 1 AS v FROM addons WHERE product_id = ?', [
        product.id,
      ])
    );

    const result = await db.run(
      `INSERT INTO addons (product_id, name, description, regular_price, extended_price, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        name,
        String(req.body.description || '').trim() || null,
        req.body.regularPrice === '' || req.body.regularPrice === undefined
          ? null
          : Math.max(0, Number(req.body.regularPrice) || 0),
        req.body.extendedPrice === '' || req.body.extendedPrice === undefined
          ? null
          : Math.max(0, Number(req.body.extendedPrice) || 0),
        req.body.status === 'draft' ? 'draft' : 'active',
        sortOrder,
      ]
    );
    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/products/:id/addons/:addonId',
  asyncRoute(async (req, res) => {
    const addon = await db.one('SELECT * FROM addons WHERE id = ? AND product_id = ?', [
      req.params.addonId, req.params.id,
    ]);
    if (!addon) return res.status(404).json({ error: 'Add-on not found.' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'An add-on needs a name.' });

    await db.run(
      `UPDATE addons SET name = ?, description = ?, regular_price = ?, extended_price = ?, status = ?
       WHERE id = ?`,
      [
        name,
        String(req.body.description || '').trim() || null,
        req.body.regularPrice === '' || req.body.regularPrice === null || req.body.regularPrice === undefined
          ? null
          : Math.max(0, Number(req.body.regularPrice) || 0),
        req.body.extendedPrice === '' || req.body.extendedPrice === null || req.body.extendedPrice === undefined
          ? null
          : Math.max(0, Number(req.body.extendedPrice) || 0),
        req.body.status === 'draft' ? 'draft' : 'active',
        addon.id,
      ]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/products/:id/addons/:addonId',
  asyncRoute(async (req, res) => {
    const addon = await db.one('SELECT id FROM addons WHERE id = ? AND product_id = ?', [
      req.params.addonId, req.params.id,
    ]);
    if (!addon) return res.status(404).json({ error: 'Add-on not found.' });
    await db.run('DELETE FROM addons WHERE id = ?', [addon.id]);
    res.json({ ok: true });
  })
);

/* ---------- an add-on's own downloads (sold standalone) ---------- */
router.get(
  '/addons/:addonId/files',
  asyncRoute(async (req, res) => {
    const addon = await db.one(
      `SELECT a.*, p.name AS product_name FROM addons a
       JOIN products p ON p.id = a.product_id WHERE a.id = ?`,
      [req.params.addonId]
    );
    if (!addon) return res.status(404).json({ error: 'Add-on not found.' });

    const files = await db.query('SELECT * FROM product_files WHERE addon_id = ? ORDER BY id', [addon.id]);
    res.json({
      addon: { id: addon.id, name: addon.name, productId: addon.product_id, productName: addon.product_name },
      maxFileMb: Math.round(MAX_FILE_BYTES / (1024 * 1024)),
      maxBundleTotalMb: Math.round(MAX_BUNDLE_TOTAL_BYTES / (1024 * 1024)),
      files: files.map((f) => ({
        id: f.id, label: f.label, kind: f.kind, platform: f.platform, version: f.version,
        originalName: f.original_name, size: f.file_size, externalUrl: f.external_url,
        requiresPurchase: Boolean(f.requires_purchase), downloadCount: f.download_count,
        missing: Boolean(f.file_name) && !filePath(f.file_name),
      })),
    });
  })
);

router.post(
  '/addons/:addonId/bundle',
  asyncRoute(async (req, res) => {
    await runUpload(uploadBundle, req, res);

    const files = req.files || [];

    const addon = await db.one('SELECT id FROM addons WHERE id = ?', [req.params.addonId]);
    if (!addon) {
      cleanupParts(files);
      return res.status(404).json({ error: 'Add-on not found.' });
    }
    if (!files.length) return res.status(400).json({ error: 'Choose a folder or at least one file.' });

    const kind = ['installer', 'source', 'apk', 'document'].includes(req.body.kind) ? req.body.kind : 'source';
    const label =
      String(req.body.label || '').trim() ||
      (kind === 'source' ? 'Source code' : kind === 'apk' ? 'Android build' : 'Download');

    const paths = Array.isArray(req.body.paths)
      ? req.body.paths
      : req.body.paths
      ? [req.body.paths]
      : [];

    const stored = storeBundle(files, label, paths);

    const result = await db.run(
      `INSERT INTO product_files (addon_id, label, kind, platform, version, file_name, original_name,
                                  file_size, requires_purchase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        addon.id,
        label,
        kind,
        ['windows', 'mac', 'linux', 'android', 'ios', 'web'].includes(req.body.platform)
          ? req.body.platform
          : kind === 'apk' ? 'android' : 'web',
        String(req.body.version || '').trim() || null,
        stored.fileName,
        stored.originalName,
        stored.size,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      originalName: stored.originalName,
      size: stored.size,
      bundled: stored.bundled,
      entryCount: stored.entryCount,
    });
  })
);

router.delete(
  '/addons/:addonId/files/:fileId',
  asyncRoute(async (req, res) => {
    const file = await db.one('SELECT * FROM product_files WHERE id = ? AND addon_id = ?', [
      req.params.fileId, req.params.addonId,
    ]);
    if (!file) return res.status(404).json({ error: 'That download no longer exists.' });
    removeFile(file.file_name);
    await db.run('DELETE FROM product_files WHERE id = ?', [file.id]);
    res.json({ ok: true });
  })
);

/* ---------- a package's own downloads (released only to buyers of that tier) ---------- */
router.get(
  '/packages/:packageId/files',
  asyncRoute(async (req, res) => {
    const pkg = await db.one(
      `SELECT pk.*, p.name AS product_name FROM packages pk
       JOIN products p ON p.id = pk.product_id WHERE pk.id = ?`,
      [req.params.packageId]
    );
    if (!pkg) return res.status(404).json({ error: 'Package not found.' });

    const [files, shared, siblings, buyers] = await Promise.all([
      db.query('SELECT * FROM product_files WHERE package_id = ? ORDER BY id', [pkg.id]),
      // files hanging off the product itself go to every buyer, whatever tier
      db.query(
        'SELECT id, label, kind FROM product_files WHERE product_id = ? AND package_id IS NULL ORDER BY id',
        [pkg.product_id]
      ),
      db.query(
        `SELECT pk.id, pk.name, pk.license_type,
                (SELECT COUNT(*) FROM product_files f WHERE f.package_id = pk.id) AS file_count
         FROM packages pk WHERE pk.product_id = ? ORDER BY pk.sort_order, pk.id`,
        [pkg.product_id]
      ),
      // how many paying customers this folder is delivered to
      db.scalar(
        `SELECT COUNT(DISTINCT o.user_id) AS v FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.package_id = ? AND o.payment_status = 'paid'`,
        [pkg.id]
      ),
    ]);

    res.json({
      package: {
        id: pkg.id,
        name: pkg.name,
        licenseType: pkg.license_type,
        price: Number(pkg.price),
        licenseCount: pkg.license_count,
        isPopular: Boolean(pkg.is_popular),
        status: pkg.status,
        productId: pkg.product_id,
        productName: pkg.product_name,
        buyers: Number(buyers || 0),
      },
      maxFileMb: Math.round(MAX_FILE_BYTES / (1024 * 1024)),
      maxBundleTotalMb: Math.round(MAX_BUNDLE_TOTAL_BYTES / (1024 * 1024)),
      sharedFiles: shared.map((f) => ({ id: f.id, label: f.label, kind: f.kind })),
      siblings: siblings.map((p2) => ({
        id: p2.id, name: p2.name, licenseType: p2.license_type, fileCount: Number(p2.file_count || 0),
      })),
      files: files.map((f) => ({
        id: f.id, label: f.label, kind: f.kind, platform: f.platform, version: f.version,
        originalName: f.original_name, size: f.file_size, externalUrl: f.external_url,
        requiresPurchase: Boolean(f.requires_purchase), downloadCount: f.download_count,
        missing: Boolean(f.file_name) && !filePath(f.file_name),
      })),
    });
  })
);

router.post(
  '/packages/:packageId/bundle',
  asyncRoute(async (req, res) => {
    await runUpload(uploadBundle, req, res);

    const files = req.files || [];

    const pkg = await db.one('SELECT id, product_id FROM packages WHERE id = ?', [req.params.packageId]);
    if (!pkg) {
      cleanupParts(files);
      return res.status(404).json({ error: 'Package not found.' });
    }
    if (!files.length) return res.status(400).json({ error: 'Choose a folder or at least one file.' });

    const kind = ['installer', 'source', 'apk', 'document'].includes(req.body.kind) ? req.body.kind : 'source';
    const label =
      String(req.body.label || '').trim() ||
      (kind === 'source' ? 'Source code' : kind === 'apk' ? 'Android build' : 'Download');

    const paths = Array.isArray(req.body.paths)
      ? req.body.paths
      : req.body.paths
      ? [req.body.paths]
      : [];

    const stored = storeBundle(files, label, paths);

    // product_id is kept alongside package_id so the file still lists under the
    // product, while package_id is what actually gates the download
    const result = await db.run(
      `INSERT INTO product_files (product_id, package_id, label, kind, platform, version, file_name,
                                  original_name, file_size, requires_purchase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        pkg.product_id,
        pkg.id,
        label,
        kind,
        ['windows', 'mac', 'linux', 'android', 'ios', 'web'].includes(req.body.platform)
          ? req.body.platform
          : kind === 'apk' ? 'android' : 'web',
        String(req.body.version || '').trim() || null,
        stored.fileName,
        stored.originalName,
        stored.size,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      originalName: stored.originalName,
      size: stored.size,
      bundled: stored.bundled,
      entryCount: stored.entryCount,
    });
  })
);

router.delete(
  '/packages/:packageId/files/:fileId',
  asyncRoute(async (req, res) => {
    const file = await db.one('SELECT * FROM product_files WHERE id = ? AND package_id = ?', [
      req.params.fileId, req.params.packageId,
    ]);
    if (!file) return res.status(404).json({ error: 'That download no longer exists.' });
    removeFile(file.file_name);
    await db.run('DELETE FROM product_files WHERE id = ?', [file.id]);
    res.json({ ok: true });
  })
);

/* ---------- the main product image ---------- */
router.post(
  '/products/:id/image',
  asyncRoute(async (req, res) => {
    await runUpload(uploadProductImage, req, res);

    if (!req.file) return res.status(400).json({ error: 'Choose an image file.' });

    const product = await db.one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      removeImage(req.file.filename);
      return res.status(404).json({ error: 'Product not found.' });
    }

    const previous = product.image;
    await db.run('UPDATE products SET image = ? WHERE id = ?', [req.file.filename, product.id]);
    if (previous && previous !== req.file.filename) removeImage(previous);

    res.json({
      ok: true,
      imageUrl: `/api/shop/review-images/${encodeURIComponent(req.file.filename)}`,
    });
  })
);

router.delete(
  '/products/:id/image',
  asyncRoute(async (req, res) => {
    const product = await db.one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    removeImage(product.image);
    await db.run('UPDATE products SET image = NULL WHERE id = ?', [product.id]);
    res.json({ ok: true });
  })
);

/* ---------- product preview images (the storefront slider) ---------- */
router.post(
  '/products/:id/images',
  asyncRoute(async (req, res) => {
    await runUpload(uploadProductImages, req, res);

    const product = await db.one('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      (req.files || []).forEach((f) => removeImage(f.filename));
      return res.status(404).json({ error: 'Product not found.' });
    }

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Choose at least one image.' });

    const existing = Number(
      await db.scalar('SELECT COUNT(*) AS v FROM product_images WHERE product_id = ?', [product.id])
    );
    if (existing + files.length > MAX_PRODUCT_IMAGES) {
      files.forEach((f) => removeImage(f.filename));
      return res.status(400).json({
        error: `A product can show at most ${MAX_PRODUCT_IMAGES} preview images (it already has ${existing}).`,
      });
    }

    // captions arrive positionally, one per file
    const captions = Array.isArray(req.body.captions)
      ? req.body.captions
      : req.body.captions
      ? [req.body.captions]
      : [];

    let order = Number(
      await db.scalar('SELECT COALESCE(MAX(sort_order),0) AS v FROM product_images WHERE product_id = ?', [
        product.id,
      ])
    );

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      await db.run(
        `INSERT INTO product_images (product_id, file_name, original_name, caption, file_size, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [product.id, f.filename, f.originalname, String(captions[i] || '').trim() || null, f.size, ++order]
      );
    }

    res.status(201).json({ added: files.length });
  })
);

router.delete(
  '/products/:id/images/:imageId',
  asyncRoute(async (req, res) => {
    const image = await db.one('SELECT * FROM product_images WHERE id = ? AND product_id = ?', [
      req.params.imageId, req.params.id,
    ]);
    if (!image) return res.status(404).json({ error: 'That image no longer exists.' });
    removeImage(image.file_name);
    await db.run('DELETE FROM product_images WHERE id = ?', [image.id]);
    res.json({ ok: true });
  })
);

/* ================= 3. orders ================= */
router.get(
  '/orders',
  asyncRoute(async (req, res) => {
    const status = String(req.query.status || '');
    const search = String(req.query.search || '').trim();

    let where = 'WHERE 1 = 1';
    const params = [];
    if (['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM orders o ${where}`, params));
    const pg = pageParams(req, total);

    const rows = await db.query(
      `SELECT o.*, (SELECT GROUP_CONCAT(oi.product_name SEPARATOR ', ')
                    FROM order_items oi WHERE oi.order_id = o.id) AS items
       FROM orders o ${where} ORDER BY o.created_at DESC LIMIT ${pg.perPage} OFFSET ${pg.offset}`,
      params
    );

    const counts = await db.query('SELECT status, COUNT(*) AS c FROM orders GROUP BY status');
    const tabCounts = { all: Number(await db.scalar('SELECT COUNT(*) AS v FROM orders')) };
    for (const c of counts) tabCounts[c.status] = Number(c.c);

    res.json({
      orders: rows.map((o) => ({
        id: o.id, orderNumber: o.order_number, customerName: o.customer_name,
        customerEmail: o.customer_email, items: o.items,
        subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.total),
        paymentMethod: o.payment_method, paymentStatus: o.payment_status,
        status: o.status, createdAt: o.created_at,
      })),
      tabCounts,
      ...pg,
    });
  })
);

router.get(
  '/orders/:id',
  asyncRoute(async (req, res) => {
    const order = await db.one('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const [items, licenses] = await Promise.all([
      db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]),
      db.query(
        `SELECT l.license_key, l.status, l.expires_at, p.name AS product_name
         FROM licenses l LEFT JOIN products p ON p.id = l.product_id WHERE l.order_id = ?`,
        [order.id]
      ),
    ]);

    res.json({
      order: {
        id: order.id, orderNumber: order.order_number,
        customerName: order.customer_name, customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        subtotal: Number(order.subtotal), discount: Number(order.discount), total: Number(order.total),
        paymentMethod: order.payment_method, paymentStatus: order.payment_status,
        status: order.status, createdAt: order.created_at,
      },
      items: items.map((i) => ({
        productName: i.product_name, unitPrice: Number(i.unit_price),
        quantity: i.quantity, lineTotal: Number(i.line_total),
      })),
      licenses: licenses.map((l) => ({
        key: l.license_key, status: l.status, expiresAt: l.expires_at, productName: l.product_name,
      })),
    });
  })
);

router.put(
  '/orders/:id/status',
  asyncRoute(async (req, res) => {
    const status = req.body.status;
    if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Unknown order status.' });
    }

    const order = await db.one('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    await db.run('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);

    // completing an unpaid order captures payment and issues the licence keys
    if (status === 'completed' && order.payment_status !== 'paid') {
      await db.run("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [order.id]);
      const existing = Number(await db.scalar('SELECT COUNT(*) AS v FROM licenses WHERE order_id = ?', [order.id]));
      if (!existing) {
        const items = await db.query(
          `SELECT oi.*, p.licence_term, pk.license_count
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN packages pk ON pk.id = oi.package_id
           WHERE oi.order_id = ?`,
          [order.id]
        );
        for (const item of items) {
          // expiry follows the product's licence term, exactly as checkout does -
          // this path was still hardcoding a year, so a lifetime licence bought by
          // bank transfer came back with an expiry date
          const expires = store.licenceExpiry(item.licence_term);
          const keys = item.quantity * (item.license_count || 1);
          for (let n = 0; n < keys; n++) {
            await db.run(
              `INSERT INTO licenses (order_item_id, order_id, product_id, user_id, license_key, status, expires_at)
               VALUES (?, ?, ?, ?, ?, 'active', ?)`,
              [item.id, order.id, item.product_id, order.user_id, store.licenseKey(), expires]
            );
          }
        }
      }

      // the customer was told their keys would arrive once payment cleared
      mailer.sendOrderKeys(order.id).catch((err) => console.error('[mail] order keys:', err.message));
    }

    // cancelling releases stock and revokes any keys
    if (status === 'cancelled' && order.status !== 'cancelled') {
      const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      for (const item of items) {
        if (item.product_id) {
          await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
        }
      }
      await db.run("UPDATE licenses SET status = 'revoked' WHERE order_id = ?", [order.id]);
    }

    res.json({ ok: true });
  })
);

router.delete(
  '/orders/:id',
  asyncRoute(async (req, res) => {
    const order = await db.one('SELECT order_number FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    await db.run('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

/* ================= 4. customers ================= */
router.get(
  '/customers',
  asyncRoute(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '');

    let where = "WHERE u.role <> 'admin'";
    const params = [];
    if (search) {
      where += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.company LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (['active', 'suspended', 'pending'].includes(status)) {
      where += ' AND u.status = ?';
      params.push(status);
    }

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM users u ${where}`, params));
    const pg = pageParams(req, total);

    const rows = await db.query(
      `SELECT u.*,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS spent
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT ${pg.perPage} OFFSET ${pg.offset}`,
      params
    );

    res.json({
      customers: rows.map((u) => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone, company: u.company,
        country: u.country, city: u.city, status: u.status,
        orderCount: Number(u.order_count), spent: Number(u.spent),
        createdAt: u.created_at, lastLoginAt: u.last_login_at,
      })),
      ...pg,
    });
  })
);

router.post(
  '/customers',
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 6) {
      return res.status(400).json({
        error: 'Provide a name, a valid email and a password of at least 6 characters.',
      });
    }
    if (await db.one('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const result = await db.run(
      `INSERT INTO users (name, email, password_hash, role, phone, company, country, city, status)
       VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?)`,
      [
        name, email, bcrypt.hashSync(password, 10),
        String(req.body.phone || '').trim() || null,
        String(req.body.company || '').trim() || null,
        String(req.body.country || '').trim() || null,
        String(req.body.city || '').trim() || null,
        ['active', 'suspended', 'pending'].includes(req.body.status) ? req.body.status : 'active',
      ]
    );
    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/customers/:id',
  asyncRoute(async (req, res) => {
    const user = await db.one("SELECT * FROM users WHERE id = ? AND role <> 'admin'", [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Customer not found.' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A customer needs a name.' });

    await db.run(
      'UPDATE users SET name = ?, phone = ?, company = ?, country = ?, city = ?, status = ? WHERE id = ?',
      [
        name,
        String(req.body.phone || '').trim() || null,
        String(req.body.company || '').trim() || null,
        String(req.body.country || '').trim() || null,
        String(req.body.city || '').trim() || null,
        ['active', 'suspended', 'pending'].includes(req.body.status) ? req.body.status : user.status,
        user.id,
      ]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/customers/:id',
  asyncRoute(async (req, res) => {
    const user = await db.one("SELECT name FROM users WHERE id = ? AND role <> 'admin'", [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Customer not found.' });
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

/* ---------- create any user, including another admin ----------
   POST /customers can only ever make a customer - the role is hardcoded there. This
   is the one way to grant admin access, so it validates harder and records who did it. */
const USER_ROLES = ['customer', 'admin'];
const MIN_PASSWORD = { customer: 6, admin: 8 };

router.get(
  '/users',
  asyncRoute(async (req, res) => {
    const role = USER_ROLES.includes(req.query.role) ? req.query.role : null;
    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.role_id, u.phone, u.company, u.country, u.city,
              u.status, u.last_login_at, u.created_at, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       ${role ? 'WHERE u.role = ?' : ''}
       ORDER BY u.role = 'admin' DESC, u.created_at DESC`,
      role ? [role] : []
    );

    res.json({
      users: rows.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        roleId: u.role_id, roleName: u.role_name,
        phone: u.phone, company: u.company, country: u.country, city: u.city,
        status: u.status, lastLoginAt: u.last_login_at, createdAt: u.created_at,
      })),
      roles: USER_ROLES,
      minPassword: MIN_PASSWORD,
    });
  })
);

router.post(
  '/users',
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = USER_ROLES.includes(req.body.role) ? req.body.role : 'customer';
    const minLength = MIN_PASSWORD[role];

    if (!name) return res.status(400).json({ error: 'A user needs a name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < minLength) {
      return res.status(400).json({
        error: `${role === 'admin' ? 'An admin' : 'A customer'} password must be at least ${minLength} characters.`,
      });
    }
    if (await db.one('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // an optional permission role from the roles table
    let roleId = null;
    if (req.body.roleId) {
      const found = await db.one('SELECT id FROM roles WHERE id = ?', [Number(req.body.roleId)]);
      if (!found) return res.status(400).json({ error: 'That permission role does not exist.' });
      roleId = found.id;
    }

    const result = await db.run(
      `INSERT INTO users (name, email, password_hash, role, role_id, phone, company, country, city, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, email, bcrypt.hashSync(password, 10), role, roleId,
        String(req.body.phone || '').trim() || null,
        String(req.body.company || '').trim() || null,
        String(req.body.country || '').trim() || null,
        String(req.body.city || '').trim() || null,
        ['active', 'suspended', 'pending'].includes(req.body.status) ? req.body.status : 'active',
      ]
    );

    // granting admin access is worth a trail
    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "user", ?)', [
      req.session.user.id,
      `Created ${role} account for ${email}`,
    ]);

    const created = await db.one(
      `SELECT u.id, u.name, u.email, u.role, u.role_id, u.phone, u.company, u.country, u.city,
              u.status, u.created_at, r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      user: {
        id: created.id, name: created.name, email: created.email, role: created.role,
        roleId: created.role_id, roleName: created.role_name,
        phone: created.phone, company: created.company,
        country: created.country, city: created.city,
        status: created.status, createdAt: created.created_at,
      },
    });
  })
);

/* ================= 5. categories ================= */
router.get(
  '/categories',
  asyncRoute(async (req, res) => {
    const rows = await db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c ORDER BY c.sort_order, c.id`
    );
    res.json({
      categories: rows.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, description: c.description,
        icon: c.icon, accent: c.accent, status: c.status,
        productCount: Number(c.product_count),
      })),
    });
  })
);

router.post(
  '/categories',
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A category needs a name.' });

    const slug = await uniqueSlug('categories', slugify(name, 'category'));
    const sortOrder = Number(await db.scalar('SELECT COALESCE(MAX(sort_order),0) + 1 AS v FROM categories'));

    const result = await db.run(
      'INSERT INTO categories (name, slug, description, icon, accent, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        name, slug,
        String(req.body.description || '').trim() || null,
        String(req.body.icon || 'box').trim(),
        String(req.body.accent || 'blue').trim(),
        req.body.status === 'inactive' ? 'inactive' : 'active',
        sortOrder,
      ]
    );
    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/categories/:id',
  asyncRoute(async (req, res) => {
    const category = await db.one('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category) return res.status(404).json({ error: 'Category not found.' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A category needs a name.' });

    await db.run(
      'UPDATE categories SET name = ?, description = ?, icon = ?, accent = ?, status = ? WHERE id = ?',
      [
        name,
        String(req.body.description || '').trim() || null,
        String(req.body.icon || 'box').trim(),
        String(req.body.accent || 'blue').trim(),
        req.body.status === 'inactive' ? 'inactive' : 'active',
        category.id,
      ]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/categories/:id',
  asyncRoute(async (req, res) => {
    const category = await db.one('SELECT name FROM categories WHERE id = ?', [req.params.id]);
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

/* ================= 6. reports ================= */
router.get(
  '/reports',
  asyncRoute(async (req, res) => {
    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : defaultFrom.toISOString().slice(0, 10);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : today.toISOString().slice(0, 10);
    const range = [from, `${to} 23:59:59`];

    const [revenue, orderCount, newCustomers, monthly, topProducts, byCategory, byMethod, byStatus] =
      await Promise.all([
        db.scalar(
          "SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE payment_status = 'paid' AND created_at BETWEEN ? AND ?",
          range
        ),
        db.scalar('SELECT COUNT(*) AS v FROM orders WHERE created_at BETWEEN ? AND ?', range),
        db.scalar("SELECT COUNT(*) AS v FROM users WHERE role = 'customer' AND created_at BETWEEN ? AND ?", range),
        db.query(
          `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, SUM(total) AS total
           FROM orders WHERE payment_status = 'paid' AND created_at BETWEEN ? AND ?
           GROUP BY ym ORDER BY ym`,
          range
        ),
        db.query(
          `SELECT p.name, p.icon, p.accent, COALESCE(SUM(oi.quantity),0) AS units,
                  COALESCE(SUM(oi.line_total),0) AS revenue
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid'
           JOIN products p ON p.id = oi.product_id
           WHERE o.created_at BETWEEN ? AND ?
           GROUP BY p.id ORDER BY revenue DESC LIMIT 6`,
          range
        ),
        db.query(
          `SELECT c.name, COALESCE(SUM(oi.line_total),0) AS revenue, COALESCE(SUM(oi.quantity),0) AS units
           FROM categories c
           LEFT JOIN products p ON p.category_id = c.id
           LEFT JOIN order_items oi ON oi.product_id = p.id
           LEFT JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid'
                              AND o.created_at BETWEEN ? AND ?
           GROUP BY c.id ORDER BY revenue DESC`,
          range
        ),
        db.query(
          `SELECT payment_method, COUNT(*) AS c, COALESCE(SUM(total),0) AS total
           FROM orders WHERE payment_status = 'paid' AND created_at BETWEEN ? AND ?
           GROUP BY payment_method ORDER BY total DESC`,
          range
        ),
        db.query(
          'SELECT status, COUNT(*) AS c, COALESCE(SUM(total),0) AS total FROM orders WHERE created_at BETWEEN ? AND ? GROUP BY status',
          range
        ),
      ]);

    const topTotal = topProducts.reduce((s, p) => s + Number(p.revenue), 0);
    const shaped = topProducts.map((p) => ({
      name: p.name, icon: p.icon, accent: p.accent,
      units: Number(p.units), revenue: Number(p.revenue),
      share: topTotal ? Math.round((Number(p.revenue) / topTotal) * 100) : 0,
    }));

    if (req.query.export === 'csv') {
      // The product figures are gross line totals; the dashboard headline is net of
      // discounts. Exporting the products alone made the two look contradictory, so
      // the file now states both and shows the arithmetic between them.
      const [grossAll, discountTotal, allProducts] = await Promise.all([
        db.scalar(
          `SELECT COALESCE(SUM(oi.line_total),0) AS v FROM order_items oi
           JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid'
           WHERE o.created_at BETWEEN ? AND ?`,
          range
        ),
        db.scalar(
          "SELECT COALESCE(SUM(discount),0) AS v FROM orders WHERE payment_status = 'paid' AND created_at BETWEEN ? AND ?",
          range
        ),
        // every product, not just the six the dashboard charts
        db.query(
          `SELECT p.name, COALESCE(SUM(oi.quantity),0) AS units,
                  COALESCE(SUM(oi.line_total),0) AS revenue
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid'
           JOIN products p ON p.id = oi.product_id
           WHERE o.created_at BETWEEN ? AND ?
           GROUP BY p.id ORDER BY revenue DESC`,
          range
        ),
      ]);

      const siteName = await mailer.siteName();
      const slug = await nameSlug();
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const n = (v) => Number(v || 0).toFixed(2);
      const gross = Number(grossAll);
      const productTotal = allProducts.reduce((sum, p) => sum + Number(p.revenue), 0);
      const paidOrders = byMethod.reduce((sum, m) => sum + Number(m.c), 0);

      const lines = [
        `${siteName} sales report`,
        `Range,${from},${to}`,
        `Generated,${new Date().toISOString()}`,
        '',
        'Summary',
        'Metric,Amount,Note',
        `Gross product revenue,${n(gross)},Sum of order line totals before discount`,
        `Discounts given,-${n(discountTotal)},Checkout discount across paid orders`,
        `Net revenue,${n(gross - Number(discountTotal))},What the dashboard reports`,
        '',
        `Paid orders,${paidOrders}`,
        `All orders in range,${Number(orderCount)}`,
        `New customers in range,${Number(newCustomers)}`,
        '',
        'Products (gross revenue before discount)',
        'Product,Units,Gross revenue,Share %',
      ];
      for (const p of allProducts) {
        const rev = Number(p.revenue);
        const share = productTotal ? Math.round((rev / productTotal) * 100) : 0;
        lines.push(`${q(p.name)},${Number(p.units)},${n(rev)},${share}`);
      }
      lines.push(
        `${q('Total')},${allProducts.reduce((sum, p) => sum + Number(p.units), 0)},${n(productTotal)},100`
      );

      lines.push('', 'Revenue by category (gross)', 'Category,Units,Gross revenue');
      for (const c of byCategory) lines.push(`${q(c.name)},${Number(c.units)},${n(c.revenue)}`);

      lines.push('', 'Paid orders by payment method (net)', 'Method,Orders,Net total');
      for (const m of byMethod) lines.push(`${q(m.payment_method)},${Number(m.c)},${n(m.total)}`);

      lines.push('', 'All orders by status (net)', 'Status,Orders,Net total');
      for (const st of byStatus) lines.push(`${q(st.status)},${Number(st.c)},${n(st.total)}`);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-report-${from}-to-${to}.csv"`);
      return res.send(lines.join('\n'));
    }

    res.json({
      from,
      to,
      totals: { revenue: Number(revenue), orders: Number(orderCount), customers: Number(newCustomers) },
      series: store.fillMonths(monthly),
      topProducts: shaped,
      byCategory: byCategory.map((c) => ({ name: c.name, revenue: Number(c.revenue), units: Number(c.units) })),
      byMethod: byMethod.map((m) => ({ method: m.payment_method, count: Number(m.c), total: Number(m.total) })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: Number(s.c), total: Number(s.total) })),
    });
  })
);

/* ================= email: subscribers, newsletter, delivery log ================= */
router.get(
  '/email',
  asyncRoute(async (req, res) => {
    const [subs, subTotals, log, counts] = await Promise.all([
      // first page only; the panel pages and searches through GET /admin/subscribers
      db.query(
        `SELECT id, email, is_active, created_at FROM newsletter_subscribers
         ORDER BY is_active DESC, created_at DESC LIMIT 8`
      ),
      db.one(
        `SELECT COUNT(*) AS total, SUM(is_active = 1) AS active FROM newsletter_subscribers`
      ),
      db.query('SELECT id, recipient, subject, kind, status, error, created_at FROM email_log ORDER BY id DESC LIMIT 40'),
      db.query('SELECT status, COUNT(*) AS c FROM email_log GROUP BY status'),
    ]);

    const tally = { sent: 0, failed: 0, skipped: 0 };
    for (const c of counts) tally[c.status] = Number(c.c);

    res.json({
      smtp: await mailer.describe(),
      subscribers: subs.map((x) => ({
        id: x.id, email: x.email, isActive: Boolean(x.is_active), createdAt: x.created_at,
      })),
      activeCount: Number(subTotals.active || 0),
      subscriberTotal: Number(subTotals.total || 0),
      subscriberPerPage: 8,
      log: log.map((l) => ({
        id: l.id, recipient: l.recipient, subject: l.subject, kind: l.kind,
        status: l.status, error: l.error, createdAt: l.created_at,
      })),
      tally,
      deals: await mailer.discountedProducts(),
      // announcements reach subscribers and customers alike, so the console counts both
      audience: await mailer.audience(),
    });
  })
);

/** Confirms the credentials work, and proves it by sending one message. */
router.post(
  '/email/test',
  asyncRoute(async (req, res) => {
    const to = String(req.body.to || req.session.user.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
      return res.status(400).json({ error: 'Enter a valid address to send the test to.' });
    }

    const check = await mailer.verify();
    if (!check.ok) return res.status(400).json({ error: check.error });

    const name = await mailer.siteName();
    const result = await mailer.send({
      to,
      kind: 'test',
      subject: `${name} test email`,
      html: await mailer.layout({
        heading: 'Your email settings work',
        intro: `This test was sent from the ${name} admin console. Order receipts and newsletters will be delivered the same way.`,
      }),
    });
    if (!result.sent) return res.status(502).json({ error: result.reason || 'The message could not be sent.' });
    res.json({ ok: true, to });
  })
);

router.post(
  '/newsletter',
  asyncRoute(async (req, res) => {
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    if (!subject) return res.status(400).json({ error: 'Give the newsletter a subject.' });
    if (!message) return res.status(400).json({ error: 'Write something to send.' });
    if (!mailer.isConfigured()) {
      return res.status(400).json({ error: 'SMTP is not configured, so nothing can be sent yet.' });
    }

    const reach = await mailer.audience();
    if (!reach.total) return res.status(400).json({ error: 'There is nobody to send to.' });

    const result = await mailer.sendNewsletter({ subject, heading: req.body.heading, message });

    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "email", ?)', [
      req.session.user.id,
      `Newsletter "${subject}" sent to ${result.sent} of ${result.total} recipients`,
    ]);
    res.json(result);
  })
);

/**
 * The subscriber list, paged and searchable.
 *
 * Separate from GET /email so the console never has to pull thousands of rows just to
 * draw the page - that endpoint returns only the first page and the totals.
 */
const SUBS_PER_PAGE = 8;

router.get(
  '/subscribers',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();

    let where = 'WHERE 1=1';
    const params = [];
    if (q) {
      where += ' AND email LIKE ?';
      params.push(`%${q}%`);
    }
    if (status === 'active') where += ' AND is_active = 1';
    if (status === 'paused') where += ' AND is_active = 0';

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM newsletter_subscribers ${where}`, params));
    const pg = pageParams(req, total, SUBS_PER_PAGE);

    const rows = await db.query(
      `SELECT id, email, is_active, created_at FROM newsletter_subscribers ${where}
       ORDER BY is_active DESC, created_at DESC LIMIT ${SUBS_PER_PAGE} OFFSET ${pg.offset}`,
      params
    );

    res.json({
      subscribers: rows.map((x) => ({
        id: x.id, email: x.email, isActive: Boolean(x.is_active), createdAt: x.created_at,
      })),
      ...pg,
    });
  })
);

router.put(
  '/subscribers/:id',
  asyncRoute(async (req, res) => {
    const sub = await db.one('SELECT id FROM newsletter_subscribers WHERE id = ?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subscriber not found.' });
    await db.run('UPDATE newsletter_subscribers SET is_active = ? WHERE id = ?', [
      req.body.isActive === false ? 0 : 1, sub.id,
    ]);
    res.json({ ok: true });
  })
);

router.delete(
  '/subscribers/:id',
  asyncRoute(async (req, res) => {
    await db.run('DELETE FROM newsletter_subscribers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

/** The list an admin collected should be theirs to take away. */
router.get(
  '/subscribers/export',
  asyncRoute(async (req, res) => {
    const rows = await db.query(
      'SELECT email, is_active, created_at FROM newsletter_subscribers ORDER BY created_at DESC'
    );
    const lines = ['Email,Active,Subscribed'];
    for (const r of rows) {
      lines.push(`"${r.email.replace(/"/g, '""')}",${r.is_active ? 'yes' : 'no'},${new Date(r.created_at).toISOString().slice(0, 10)}`);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${await nameSlug()}-subscribers.csv"`);
    res.send(lines.join('\n'));
  })
);

/**
 * Announce whatever is discounted right now.
 *
 * The product list is read from the catalogue rather than typed by the admin, so the
 * email cannot advertise a discount that is not actually loaded.
 */
router.post(
  '/newsletter/deals',
  asyncRoute(async (req, res) => {
    if (!mailer.isConfigured()) {
      return res.status(400).json({ error: 'SMTP is not configured, so nothing can be sent yet.' });
    }
    const all = await mailer.discountedProducts();
    const deals = all.filter((d) => d.announce);
    if (!deals.length) {
      return res.status(400).json({
        error: all.length
          ? 'Every discounted product is set not to be announced. Tick "Announce this discount" '
            + 'on at least one of them first.'
          : 'No product is discounted right now. Set a discount on a product first.',
      });
    }
    const reach = await mailer.audience();
    if (!reach.total) return res.status(400).json({ error: 'There is nobody to send to.' });

    const result = await mailer.sendDealsAnnouncement({
      subject: String(req.body.subject || '').trim() || undefined,
      message: String(req.body.message || '').trim() || undefined,
    });

    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "email", ?)', [
      req.session.user.id,
      `Deals announcement (${deals.length} discounted) sent to ${result.sent} of ${result.total} recipients`,
    ]);
    res.json(result);
  })
);

/* ================= 7. settings ================= */
const SETTING_GROUPS = {
  general: ['site_name', 'site_url', 'site_tagline', 'hero_title', 'hero_highlight', 'hero_subtitle',
            'hero_banner', 'hero_banner_sub', 'support_email', 'support_phone',
            'office_address', 'timezone', 'currency', 'licence_terms'],
  payment: ['payment_card', 'payment_paypal', 'payment_mobile_money', 'payment_bank_transfer',
            'payment_cash', 'checkout_discount',
            // per-method overrides; blank falls back to checkout_discount
            'discount_card', 'discount_paypal', 'discount_mobile_money',
            'discount_bank_transfer', 'discount_cash'],
  email: ['email_from_name', 'email_from_address', 'email_order_confirmation'],
};

router.get(
  '/settings',
  asyncRoute(async (req, res) => {
    const settings = await store.settings();
    const admins = await db.query(
      `SELECT u.id, u.name, u.email, u.status, u.last_login_at, u.created_at,
              u.role_id, r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.role = 'admin' ORDER BY u.created_at`
    );
    const permissionRoles = await db.query(
      'SELECT id, name, slug, description FROM roles ORDER BY sort_order, id'
    );
    res.json({
      settings,
      groups: SETTING_GROUPS,
      permissionRoles,
      discountRates: await store.discountRates(),
      licenceTerms: await store.licenceTerms(),
      defaultLicenceTerms: store.DEFAULT_LICENCE_TERMS,
      admins: admins.map((a) => ({
        id: a.id, name: a.name, email: a.email, status: a.status,
        roleId: a.role_id, roleName: a.role_name,
        lastLoginAt: a.last_login_at, createdAt: a.created_at,
      })),
    });
  })
);

router.put(
  '/settings/:group',
  asyncRoute(async (req, res) => {
    const group = req.params.group;
    const keys = SETTING_GROUPS[group];
    if (!keys) return res.status(400).json({ error: 'Unknown settings group.' });

    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
      const raw = req.body[key];
      const value = typeof raw === 'boolean' ? (raw ? '1' : '0') : String(raw ?? '').trim();

      await db.run(
        `INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value, group]
      );
    }

    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "settings", ?)', [
      req.session.user.id, `${group.charAt(0).toUpperCase() + group.slice(1)} settings updated`,
    ]);

    res.json({ ok: true });
  })
);

/* ================= 8. roles & permissions ================= */
const PERMISSIONS = ['view', 'edit', 'delete'];

function readPermissions(body) {
  const raw = body.permissions;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.filter((p) => PERMISSIONS.includes(p));
}

router.get(
  '/roles',
  asyncRoute(async (req, res) => {
    const rows = await db.query(
      `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
       FROM roles r ORDER BY r.sort_order, r.id`
    );
    res.json({
      roles: rows.map((r) => {
        let perms = r.permissions;
        if (typeof perms === 'string') {
          try {
            perms = JSON.parse(perms);
          } catch {
            perms = [];
          }
        }
        return {
          id: r.id, name: r.name, slug: r.slug, description: r.description,
          permissions: perms || [], isSystem: Boolean(r.is_system),
          userCount: Number(r.user_count),
        };
      }),
      allPermissions: PERMISSIONS,
    });
  })
);

router.post(
  '/roles',
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A role needs a name.' });
    if (await db.one('SELECT id FROM roles WHERE name = ?', [name])) {
      return res.status(409).json({ error: 'A role with that name already exists.' });
    }

    const slug = await uniqueSlug('roles', slugify(name, 'role'));
    const sortOrder = Number(await db.scalar('SELECT COALESCE(MAX(sort_order),0) + 1 AS v FROM roles'));

    const result = await db.run(
      'INSERT INTO roles (name, slug, description, permissions, sort_order) VALUES (?, ?, ?, ?, ?)',
      [name, slug, String(req.body.description || '').trim() || null,
       JSON.stringify(readPermissions(req.body)), sortOrder]
    );
    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/roles/:id',
  asyncRoute(async (req, res) => {
    const role = await db.one('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!role) return res.status(404).json({ error: 'Role not found.' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A role needs a name.' });

    await db.run('UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?', [
      name,
      String(req.body.description || '').trim() || null,
      JSON.stringify(readPermissions(req.body)),
      role.id,
    ]);
    res.json({ ok: true });
  })
);

router.delete(
  '/roles/:id',
  asyncRoute(async (req, res) => {
    const role = await db.one('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    if (role.is_system) {
      return res.status(400).json({ error: `${role.name} is a system role and cannot be deleted.` });
    }
    await db.run('DELETE FROM roles WHERE id = ?', [role.id]);
    res.json({ ok: true });
  })
);

/* ================= demos: review links + APK builds ================= */
router.get(
  '/demos',
  asyncRoute(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const platform = String(req.query.platform || '');
    const status = String(req.query.status || '');
    const hasApk = String(req.query.hasApk || '');

    let where = 'WHERE 1 = 1';
    const params = [];

    if (search) {
      where += ` AND (d.title LIKE ? OR d.description LIKE ? OR d.slug LIKE ?
                      OR d.web_url LIKE ? OR d.review_url LIKE ? OR d.apk_name LIKE ?
                      OR p.name LIKE ?)`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like, like);
    }
    if (store.DEMO_PLATFORMS.includes(platform)) {
      where += ' AND d.platform = ?';
      params.push(platform);
    }
    if (['published', 'draft'].includes(status)) {
      where += ' AND d.status = ?';
      params.push(status);
    }
    // "has a build" means either store's - a demo can carry both
    if (hasApk === 'yes') where += ' AND (d.apk_file IS NOT NULL OR d.ios_file IS NOT NULL)';
    if (hasApk === 'no') where += ' AND d.apk_file IS NULL AND d.ios_file IS NULL';

    const [demos, allDemos, products, recentDownloads] = await Promise.all([
      db.query(
        `SELECT d.*, p.name AS product_name, p.image AS product_image, u.name AS author
         FROM demos d
         LEFT JOIN products p ON p.id = d.product_id
         LEFT JOIN users u ON u.id = d.created_by
         ${where}
         ORDER BY d.sort_order, d.id`,
        params
      ),
      // unfiltered, so the KPI tiles keep showing store-wide totals
      db.query('SELECT status, apk_file, ios_file, download_count FROM demos'),
      db.query("SELECT id, name FROM products WHERE status = 'active' ORDER BY sort_order"),
      db.query(
        `SELECT dl.*, d.title, u.name AS user_name
         FROM download_log dl
         JOIN demos d ON d.id = dl.demo_id
         LEFT JOIN users u ON u.id = dl.user_id
         ORDER BY dl.created_at DESC LIMIT 8`
      ),
    ]);

    res.json({
      demos: demos.map((d) => ({
        id: d.id, title: d.title, slug: d.slug, description: d.description,
        platform: d.platform, webUrl: d.web_url, reviewUrl: d.review_url,
        builds: store.demoBuilds(d, apkPath),
        hasApk: Boolean(d.apk_file), hasIpa: Boolean(d.ios_file),
        visibility: d.visibility, status: d.status,
        downloadCount: d.download_count,
        productId: d.product_id, productName: d.product_name,
        // the demo is shown as its product's picture where there is one
        productImage: d.product_image
          ? `/api/shop/review-images/${encodeURIComponent(d.product_image)}`
          : null,
        author: d.author,
      })),
      products: products.map((p) => ({ id: p.id, name: p.name })),
      recentDownloads: recentDownloads.map((r) => ({
        id: r.id, title: r.title, userName: r.user_name,
        ipAddress: r.ip_address, createdAt: r.created_at,
      })),
      maxApkMb: Math.round(MAX_APK_BYTES / (1024 * 1024)),
      platforms: store.DEMO_PLATFORMS,
      // totals across every demo, so filtering does not move the KPI numbers
      totals: {
        demos: allDemos.length,
        published: allDemos.filter((d) => d.status === 'published').length,
        withApk: allDemos.filter((d) => d.apk_file || d.ios_file).length,
        downloads: allDemos.reduce((s, d) => s + Number(d.download_count || 0), 0),
      },
      matched: demos.length,
    });
  })
);

router.post(
  '/demos',
  asyncRoute(async (req, res) => {
    await runUpload(uploadDemoBuilds, req, res);

    // .fields() gives one array per field name; a demo may arrive with either
    // build, both, or neither
    const apk = req.files && req.files.apk ? req.files.apk[0] : null;
    const ipa = req.files && req.files.ipa ? req.files.ipa[0] : null;
    const uploaded = [apk, ipa].filter(Boolean);
    const discard = () => uploaded.forEach((f) => removeApk(f.filename));

    const title = String(req.body.title || '').trim();
    if (!title) {
      discard();
      return res.status(400).json({ error: 'The demo needs a title.' });
    }

    const web = cleanUrl(req.body.webUrl);
    const review = cleanUrl(req.body.reviewUrl);
    if (!web.ok || !review.ok) {
      discard();
      return res.status(400).json({ error: 'Links must start with http:// or https://' });
    }

    const platform = store.DEMO_PLATFORMS.includes(req.body.platform) ? req.body.platform : 'web';

    // a demo has to give people something to open or install
    if (!web.value && !review.value && !uploaded.length) {
      return res.status(400).json({
        error: 'Add a demo link, a review link, or a build - otherwise there is nothing to publish.',
      });
    }

    const slug = await uniqueSlug('demos', slugify(req.body.slug || title, 'demo'));
    const sortOrder = Number(await db.scalar('SELECT COALESCE(MAX(sort_order),0) + 1 AS v FROM demos'));

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const result = await db.run(
      `INSERT INTO demos (title, slug, product_id, description, platform, web_url, review_url,
                          apk_file, apk_name, apk_size, apk_version, apk_uploaded_at,
                          ios_file, ios_name, ios_size, ios_version, ios_uploaded_at,
                          visibility, status, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, slug,
        req.body.productId ? Number(req.body.productId) : null,
        String(req.body.description || '').trim() || null,
        platform, web.value, review.value,
        apk ? apk.filename : null,
        apk ? apk.originalname : null,
        apk ? apk.size : null,
        String(req.body.apkVersion || '').trim() || null,
        apk ? now : null,
        ipa ? ipa.filename : null,
        ipa ? ipa.originalname : null,
        ipa ? ipa.size : null,
        String(req.body.ipaVersion || '').trim() || null,
        ipa ? now : null,
        req.body.visibility === 'users' ? 'users' : 'public',
        req.body.status === 'draft' ? 'draft' : 'published',
        sortOrder, req.session.user.id,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      needsBuild: store.MOBILE_PLATFORMS.includes(platform) && !uploaded.length,
    });
  })
);

router.put(
  '/demos/:id',
  asyncRoute(async (req, res) => {
    const demo = await db.one('SELECT * FROM demos WHERE id = ?', [req.params.id]);
    if (!demo) return res.status(404).json({ error: 'Demo not found.' });

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'The demo needs a title.' });

    const web = cleanUrl(req.body.webUrl);
    const review = cleanUrl(req.body.reviewUrl);
    if (!web.ok || !review.ok) {
      return res.status(400).json({ error: 'Links must start with http:// or https://' });
    }

    // a build's version is set where the build is uploaded, so an edit that does
    // not mention one must leave it alone rather than blank it
    const keptVersion = (key, current) =>
      req.body[key] === undefined ? current : String(req.body[key] || '').trim() || null;

    await db.run(
      `UPDATE demos SET title = ?, product_id = ?, description = ?, platform = ?,
                        web_url = ?, review_url = ?, apk_version = ?, ios_version = ?,
                        visibility = ?, status = ?
       WHERE id = ?`,
      [
        title,
        req.body.productId ? Number(req.body.productId) : null,
        String(req.body.description || '').trim() || null,
        store.DEMO_PLATFORMS.includes(req.body.platform) ? req.body.platform : demo.platform,
        web.value, review.value,
        keptVersion('apkVersion', demo.apk_version),
        keptVersion('ipaVersion', demo.ios_version),
        req.body.visibility === 'users' ? 'users' : 'public',
        req.body.status === 'draft' ? 'draft' : 'published',
        demo.id,
      ]
    );
    res.json({ ok: true });
  })
);

/**
 * Upload / remove / download a demo's build, one route set per slot:
 *
 *   POST|DELETE|GET  /demos/:id/apk   the Android build
 *   POST|DELETE|GET  /demos/:id/ipa   the iOS build
 *
 * The slots are independent - replacing one leaves the other alone - and the
 * column names come from store.DEMO_BUILD_SLOTS, never from the request.
 */
const BUILD_UPLOADS = { apk: uploadApk, ipa: uploadIpa };

store.DEMO_BUILD_SLOTS.forEach((slot) => {
  const { file: fileCol, name: nameCol, size: sizeCol, version: verCol, at: atCol } = slot.cols;

  router.post(
    `/demos/:id/${slot.path}`,
    asyncRoute(async (req, res) => {
      await runUpload(BUILD_UPLOADS[slot.path], req, res);

      if (!req.file) return res.status(400).json({ error: `Choose the ${slot.ext} file to upload.` });

      const demo = await db.one('SELECT * FROM demos WHERE id = ?', [req.params.id]);
      if (!demo) {
        removeApk(req.file.filename);
        return res.status(404).json({ error: 'Demo not found.' });
      }

      const previous = demo[fileCol];
      const version = String(req.body[slot.versionKey] || '').trim() || demo[verCol];

      await db.run(
        // the platform stays whatever the admin chose - attaching a build does not reclassify it
        `UPDATE demos
         SET ${fileCol} = ?, ${nameCol} = ?, ${sizeCol} = ?, ${verCol} = ?, ${atCol} = NOW()
         WHERE id = ?`,
        [req.file.filename, req.file.originalname, req.file.size, version, demo.id]
      );

      if (previous && previous !== req.file.filename) removeApk(previous);

      res.json({
        ok: true,
        os: slot.os,
        format: slot.format,
        name: req.file.originalname,
        size: req.file.size,
        version,
      });
    })
  );

  router.delete(
    `/demos/:id/${slot.path}`,
    asyncRoute(async (req, res) => {
      const demo = await db.one('SELECT * FROM demos WHERE id = ?', [req.params.id]);
      if (!demo) return res.status(404).json({ error: 'Demo not found.' });

      removeApk(demo[fileCol]);
      await db.run(
        `UPDATE demos SET ${fileCol} = NULL, ${nameCol} = NULL, ${sizeCol} = NULL, ${atCol} = NULL
         WHERE id = ?`,
        [demo.id]
      );
      res.json({ ok: true });
    })
  );

  router.get(
    `/demos/:id/${slot.path}`,
    asyncRoute(async (req, res) => {
      const demo = await db.one('SELECT * FROM demos WHERE id = ?', [req.params.id]);
      if (!demo || !demo[fileCol]) {
        return res.status(404).json({ error: `No ${slot.format} is attached to that demo.` });
      }

      const file = apkPath(demo[fileCol]);
      if (!file) return res.status(410).json({ error: 'The build is missing from storage.' });

      res.type(buildMime(demo[fileCol]));
      return res.download(file, buildFileName(demo[fileCol], demo[nameCol], demo.slug));
    })
  );
});

router.delete(
  '/demos/:id',
  asyncRoute(async (req, res) => {
    const demo = await db.one('SELECT * FROM demos WHERE id = ?', [req.params.id]);
    if (!demo) return res.status(404).json({ error: 'Demo not found.' });
    // both builds go with it
    store.DEMO_BUILD_SLOTS.forEach((slot) => removeApk(demo[slot.cols.file]));
    await db.run('DELETE FROM demos WHERE id = ?', [demo.id]);
    res.json({ ok: true });
  })
);

/* ================= messages & tickets ================= */
router.get(
  '/messages',
  asyncRoute(async (req, res) => {
    const status = String(req.query.status || '');
    let where = '';
    const params = [];
    if (['new', 'read', 'replied'].includes(status)) {
      where = 'WHERE status = ?';
      params.push(status);
    }

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM contact_messages ${where}`, params));
    const pg = pageParams(req, total);

    const [rows, tickets] = await Promise.all([
      db.query(
        `SELECT * FROM contact_messages ${where} ORDER BY created_at DESC LIMIT ${pg.perPage} OFFSET ${pg.offset}`,
        params
      ),
      db.query(
        `SELECT t.*, u.name AS user_name, u.email AS user_email, o.order_number,
                r.name AS replier_name
         FROM support_tickets t
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN users r ON r.id = t.replied_by
         LEFT JOIN orders o ON o.id = t.order_id
         ORDER BY FIELD(t.status,'open','pending','closed'), t.created_at DESC LIMIT 20`
      ),
    ]);

    res.json({
      messages: rows.map((m) => ({
        id: m.id, name: m.name, email: m.email, subject: m.subject,
        message: m.message, status: m.status, createdAt: m.created_at,
      })),
      tickets: tickets.map((t) => ({
        id: t.id, subject: t.subject, message: t.message, status: t.status,
        userName: t.user_name, userEmail: t.user_email,
        orderNumber: t.order_number, createdAt: t.created_at,
        reply: t.admin_reply, repliedAt: t.replied_at, repliedBy: t.replier_name,
      })),
      ...pg,
    });
  })
);

router.put(
  '/messages/:id/status',
  asyncRoute(async (req, res) => {
    if (!['new', 'read', 'replied'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Unknown status.' });
    }
    await db.run('UPDATE contact_messages SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ ok: true });
  })
);

router.delete(
  '/messages/:id',
  asyncRoute(async (req, res) => {
    await db.run('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  })
);

/**
 * Answer a ticket. The reply is stored on the ticket and shown to the customer on
 * their Support page - the page already promised a reply, but nothing recorded one.
 */
router.post(
  '/tickets/:id/reply',
  asyncRoute(async (req, res) => {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Write a reply first.' });
    if (message.length > 4000) return res.status(400).json({ error: 'That reply is too long.' });

    const ticket = await db.one('SELECT id, status FROM support_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    // an answered ticket is waiting on the customer, not on us
    const status = ['open'].includes(ticket.status) ? 'pending' : ticket.status;

    await db.run(
      `UPDATE support_tickets
       SET admin_reply = ?, replied_at = NOW(), replied_by = ?, status = ?
       WHERE id = ?`,
      [message, req.session.user.id, status, ticket.id]
    );

    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "support", ?)', [
      req.session.user.id, `Replied to support ticket #${ticket.id}`,
    ]);

    res.json({ ok: true, status });
  })
);

router.put(
  '/tickets/:id/status',
  asyncRoute(async (req, res) => {
    if (!['open', 'pending', 'closed'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Unknown ticket status.' });
    }
    await db.run('UPDATE support_tickets SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
