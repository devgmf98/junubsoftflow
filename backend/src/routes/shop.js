'use strict';

/** Public storefront API: catalogue, cart pricing, checkout, orders. */

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const store = require('../store');
const mailer = require('../mailer');
const { asyncRoute } = require('../middleware/auth');

const router = express.Router();

const PER_PAGE = 9;
const MAX_QTY = 20;

/** reviews.images is JSON; mysql2 may hand it back as a string or already parsed. */
function parseImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function shapeProduct(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    vendor: p.vendor,
    shortDesc: p.short_desc,
    description: p.description,
    // price is what the customer actually pays; listPrice is the crossed-out one.
    // Doing it here means every card, list and detail page agrees by construction.
    price: store.salePrice(p),
    listPrice: store.productDiscount(p) ? Number(p.price) : null,
    discountPercent: store.productDiscount(p),
    discountLabel: p.discount_label || null,
    pricingMode: p.pricing_mode || 'simple',
    comparePrice: p.compare_price === null ? null : Number(p.compare_price),
    stock: p.stock,
    licenceTerm: p.licence_term,
    platforms: p.platforms,
    badge: p.badge,
    // icon/accent stay as the fallback for products with no uploaded image
    icon: p.icon,
    accent: p.accent,
    imageUrl: p.image ? `/api/shop/review-images/${encodeURIComponent(p.image)}` : null,
    rating: Number(p.rating),
    reviewCount: p.review_count,
    isFeatured: Boolean(p.is_featured),
    categoryId: p.category_id,
    categoryName: p.category_name || null,
    categorySlug: p.category_slug || null,
  };
}

/* ================= settings ================= */
router.get(
  '/settings',
  asyncRoute(async (req, res) => {
    const all = await store.settings();
    // only the storefront-facing keys are exposed publicly
    const publicKeys = [
      'site_name', 'site_url', 'site_tagline', 'hero_title', 'hero_highlight', 'hero_subtitle',
      'hero_banner', 'hero_banner_sub', 'support_email', 'support_phone',
      'office_address', 'currency', 'checkout_discount',
      'payment_card', 'payment_paypal', 'payment_mobile_money', 'payment_bank_transfer',
      'payment_cash',
    ];
    const out = {};
    for (const k of publicKeys) if (all[k] !== undefined) out[k] = all[k];
    res.json({ settings: out });
  })
);

/* ================= categories ================= */
router.get(
  '/categories',
  asyncRoute(async (req, res) => {
    const rows = await db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
       FROM categories c WHERE c.status = 'active' ORDER BY c.sort_order`
    );
    res.json({
      categories: rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon: c.icon,
        accent: c.accent,
        productCount: Number(c.product_count),
      })),
    });
  })
);

/* ================= home ================= */
router.get(
  '/home',
  asyncRoute(async (req, res) => {
    const [featured, deals, newest, categories, settings] = await Promise.all([
      // Popular Software is whatever is featured, discounted or not - a best-seller
      // does not stop being one because it is on offer. Deals also get their own
      // section above, so a product can honestly appear in both.
      db.query(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'active' AND p.is_featured = 1
         ORDER BY p.sort_order LIMIT 4`
      ),
      // Big Deal Offers - best discount first
      db.query(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'active' AND p.discount_percent > 0
         ORDER BY p.discount_percent DESC, p.sort_order LIMIT 4`
      ),
      db.query(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'active' ORDER BY p.created_at DESC LIMIT 4`
      ),
      db.query(
        `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
         FROM categories c WHERE c.status = 'active' ORDER BY c.sort_order`
      ),
      store.settings(),
    ]);

    res.json({
      featured: featured.map(shapeProduct),
      deals: deals.map(shapeProduct),
      newest: newest.map(shapeProduct),
      categories: categories.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, description: c.description,
        icon: c.icon, accent: c.accent, productCount: Number(c.product_count),
      })),
      settings,
    });
  })
);

/* ================= product list ================= */
router.get(
  '/products',
  asyncRoute(async (req, res) => {
    const search = String(req.query.q || '').trim();
    const categorySlug = String(req.query.category || '').trim();
    const sort = String(req.query.sort || 'featured');

    let where = "WHERE p.status = 'active'";
    const params = [];

    if (search) {
      where += ' AND (p.name LIKE ? OR p.short_desc LIKE ? OR p.vendor LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    let activeCategory = null;
    if (categorySlug) {
      activeCategory = await db.one('SELECT * FROM categories WHERE slug = ?', [categorySlug]);
      if (activeCategory) {
        where += ' AND p.category_id = ?';
        params.push(activeCategory.id);
      }
    }

    const ORDER = {
      featured: 'p.is_featured DESC, p.sort_order',
      price_asc: 'p.price ASC',
      price_desc: 'p.price DESC',
      rating: 'p.rating DESC',
      newest: 'p.created_at DESC',
    };
    const orderBy = ORDER[sort] || ORDER.featured;

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM products p ${where}`, params));
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), pages);

    const rows = await db.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${where} ORDER BY ${orderBy} LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`,
      params
    );

    res.json({
      products: rows.map(shapeProduct),
      activeCategory: activeCategory
        ? { id: activeCategory.id, name: activeCategory.name, slug: activeCategory.slug }
        : null,
      page,
      pages,
      total,
      perPage: PER_PAGE,
    });
  })
);

/* ================= product detail ================= */
router.get(
  '/products/:slug',
  asyncRoute(async (req, res) => {
    const p = await db.one(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.status = 'active'`,
      [req.params.slug]
    );
    if (!p) return res.status(404).json({ error: 'Product not found.' });

    const [packages, packageFeatures, licenseMatrix, addons] = await Promise.all([
      db.query(
        "SELECT * FROM packages WHERE product_id = ? AND status = 'active' ORDER BY sort_order, id",
        [p.id]
      ),
      db.query(
        `SELECT pf.* FROM package_features pf
         JOIN packages pk ON pk.id = pf.package_id
         WHERE pk.product_id = ? ORDER BY pf.sort_order, pf.id`,
        [p.id]
      ),
      db.query('SELECT * FROM license_features WHERE product_id = ? ORDER BY sort_order, id', [p.id]),
      db.query("SELECT * FROM addons WHERE product_id = ? AND status = 'active' ORDER BY sort_order, id", [p.id]),
    ]);

    const [previewImages, deliverables] = await Promise.all([
      db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [p.id]),
      // what a buyer receives - listed, but never downloadable from here
      db.query(
        `SELECT f.label, f.kind, f.platform, f.version, f.file_size, f.external_url,
                f.package_id, pk.name AS package_name
         FROM product_files f
         LEFT JOIN packages pk ON pk.id = f.package_id
         WHERE f.product_id = ? ORDER BY f.package_id IS NOT NULL, f.kind, f.id`,
        [p.id]
      ),
    ]);

    const [features, reviews, related, demos] = await Promise.all([
      db.query('SELECT label FROM product_features WHERE product_id = ? ORDER BY sort_order', [p.id]),
      db.query(
        `SELECT id, author, rating, title, body, images, created_at
         FROM reviews WHERE product_id = ? AND status = 'published'
         ORDER BY created_at DESC LIMIT 8`,
        [p.id]
      ),
      db.query(
        `SELECT p2.*, c.name AS category_name, c.slug AS category_slug FROM products p2
         LEFT JOIN categories c ON c.id = p2.category_id
         WHERE p2.status = 'active' AND p2.id <> ? AND p2.category_id <=> ?
         ORDER BY p2.is_featured DESC LIMIT 4`,
        [p.id, p.category_id]
      ),
      db.query(
        "SELECT id, title, platform, web_url, review_url, apk_file, apk_version FROM demos WHERE product_id = ? AND status = 'published' AND visibility = 'public' ORDER BY sort_order",
        [p.id]
      ),
    ]);

    // group the tick-lists onto their package, and the packages onto their licence type
    const featuresFor = (packageId, section) =>
      packageFeatures
        .filter((f) => f.package_id === packageId && f.section === section)
        .map((f) => ({ label: f.label, included: Boolean(f.included) }));

    const shapedPackages = packages.map((pk) => {
      const price = Number(pk.price);
      const compare = pk.compare_price === null ? null : Number(pk.compare_price);
      return {
        id: pk.id,
        licenseType: pk.license_type,
        name: pk.name,
        tagline: pk.tagline,
        price,
        comparePrice: compare,
        savePercent: compare && compare > price ? Math.round(((compare - price) / compare) * 100) : 0,
        licenseCount: pk.license_count,
        perLicense: pk.license_count > 1 ? Math.round((price / pk.license_count) * 100) / 100 : null,
        isPopular: Boolean(pk.is_popular),
        ctaLabel: pk.cta_label,
        included: featuresFor(pk.id, 'included'),
        addons: featuresFor(pk.id, 'addons'),
        benefits: featuresFor(pk.id, 'benefits'),
      };
    });

    const licenseTypes = [...new Set(shapedPackages.map((pk) => pk.licenseType))];

    res.json({
      product: shapeProduct(p),
      pricing: {
        licenseTypes,
        packages: shapedPackages,
        // the "Which License to Purchase?" comparison
        matrix: ['regular', 'extended']
          .map((type) => ({
            licenseType: type,
            rows: licenseMatrix
              .filter((r) => r.license_type === type)
              .map((r) => ({ label: r.label, included: Boolean(r.included) })),
          }))
          .filter((m) => m.rows.length),
        addons: addons.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          regularPrice: a.regular_price === null ? null : Number(a.regular_price),
          extendedPrice: a.extended_price === null ? null : Number(a.extended_price),
        })),
      },
      previewImages: previewImages.map((i) => ({
        id: i.id,
        caption: i.caption,
        url: `/api/shop/review-images/${encodeURIComponent(i.file_name)}`,
      })),
      // shown as "what you get" - the files themselves stay behind the paywall
      deliverables: deliverables.map((d) => ({
        label: d.label,
        kind: d.kind,
        packageId: d.package_id || null,
        packageName: d.package_name || null,
        platform: d.platform,
        version: d.version,
        size: d.external_url ? null : d.file_size,
        isExternal: Boolean(d.external_url),
      })),
      features: features.map((f) => f.label),
      reviews: reviews.map((r) => ({
        id: r.id,
        author: r.author,
        rating: r.rating,
        title: r.title,
        body: r.body,
        createdAt: r.created_at,
        images: parseImages(r.images).map((file) => `/api/shop/review-images/${encodeURIComponent(file)}`),
      })),
      related: related.map(shapeProduct),
      demos: demos.map((d) => ({
        id: d.id, title: d.title, platform: d.platform,
        webUrl: d.web_url, reviewUrl: d.review_url,
        hasApk: Boolean(d.apk_file), apkVersion: d.apk_version,
      })),
    });
  })
);

/** Serves a review image from storage/images (never served statically). */
router.get(
  '/review-images/:file',
  asyncRoute(async (req, res) => {
    const { imagePath, imageMime } = require('../upload');
    const file = String(req.params.file || '');

    // imagePath() basenames the input, but reject the obvious traversal shapes early
    if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) {
      return res.status(400).json({ error: 'Bad image reference.' });
    }

    const onDisk = imagePath(file);
    if (!onDisk) return res.status(404).json({ error: 'Image not found.' });

    res.type(imageMime(file));
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // These are operator-uploaded files served from our own origin, and an SVG can
    // carry <script>. Sandbox them and forbid sub-resources so one can never run.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Content-Disposition', 'inline');

    return res.sendFile(onDisk);
  })
);

/* ================= cart pricing =================
   The client keeps the cart; the server re-prices it from the database so
   quantities and prices can never be tampered with. */
async function priceCart(rawItems, method) {
  /* A cart line is one of:
       { productId }                    - the product's own price
       { productId, packageId }         - a tiered package (Starter / Combo / ...)
       { addonId }                      - a premium add-on at its regular/extended price
     Everything is re-priced here from the database; the browser is never trusted. */
  const lines = [];
  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    const qty = Math.max(1, Math.min(MAX_QTY, parseInt(item.quantity, 10) || 1));
    const productId = Number(item.productId ?? item.id) || null;
    const packageId = Number(item.packageId) || null;
    const addonId = Number(item.addonId) || null;
    const licenseType = ['regular', 'extended', 'agency'].includes(item.licenseType)
      ? item.licenseType
      : null;

    if (!productId && !addonId) continue;
    lines.push({ productId, packageId, addonId, licenseType, quantity: qty });
  }
  if (!lines.length) return { items: [], subtotal: 0, discount: 0, total: 0, count: 0, removed: [] };

  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean))];
  const packageIds = [...new Set(lines.map((l) => l.packageId).filter(Boolean))];
  const addonIds = [...new Set(lines.map((l) => l.addonId).filter(Boolean))];

  const inList = (arr) => arr.map(() => '?').join(',');

  const [products, packages, addons] = await Promise.all([
    productIds.length
      ? db.query(
          `SELECT id, name, slug, price, discount_percent, discount_label, stock, icon, accent, image, short_desc, licence_term
           FROM products WHERE id IN (${inList(productIds)}) AND status = 'active'`,
          productIds
        )
      : [],
    packageIds.length
      ? db.query(
          `SELECT * FROM packages WHERE id IN (${inList(packageIds)}) AND status = 'active'`,
          packageIds
        )
      : [],
    addonIds.length
      ? db.query(
          `SELECT a.*, p.licence_term FROM addons a
           JOIN products p ON p.id = a.product_id
           WHERE a.id IN (${inList(addonIds)}) AND a.status = 'active'`,
          addonIds
        )
      : [],
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const packageById = new Map(packages.map((p) => [p.id, p]));
  const addonById = new Map(addons.map((a) => [a.id, a]));

  const items = [];
  const removed = [];

  for (const line of lines) {
    /* ---- add-on line ---- */
    if (line.addonId) {
      const addon = addonById.get(line.addonId);
      const price =
        addon && line.licenseType === 'extended' ? addon.extended_price : addon?.regular_price;
      if (!addon || price === null || price === undefined) {
        removed.push({ addonId: line.addonId });
        continue;
      }
      items.push({
        key: `addon-${addon.id}-${line.licenseType || 'regular'}`,
        addonId: addon.id,
        productId: addon.product_id,
        name: addon.name,
        kind: 'addon',
        licenceTerm: addon.licence_term || null,
        licenseType: line.licenseType || 'regular',
        price: Number(price),
        stock: MAX_QTY,
        quantity: line.quantity,
        lineTotal: Math.round(Number(price) * line.quantity * 100) / 100,
      });
      continue;
    }

    const product = productById.get(line.productId);
    if (!product) {
      removed.push({ productId: line.productId });
      continue;
    }

    /* ---- package line ---- */
    if (line.packageId) {
      const pkg = packageById.get(line.packageId);
      if (!pkg || pkg.product_id !== product.id) {
        removed.push({ productId: line.productId, packageId: line.packageId });
        continue;
      }
      const price = Number(pkg.price);
      items.push({
        key: `pkg-${pkg.id}`,
        productId: product.id,
        packageId: pkg.id,
        name: product.name,
        packageName: pkg.name,
        licenseType: pkg.license_type,
        licenseCount: pkg.license_count,
        licenceTerm: product.licence_term,
        kind: 'package',
        slug: product.slug,
        icon: product.icon,
        accent: product.accent,
        imageUrl: product.image ? `/api/shop/review-images/${encodeURIComponent(product.image)}` : null,
        price,
        stock: product.stock,
        quantity: line.quantity,
        lineTotal: Math.round(price * line.quantity * 100) / 100,
      });
      continue;
    }

    /* ---- plain product line ---- */
    const price = store.salePrice(product);
    const productPct = store.productDiscount(product);
    items.push({
      key: `product-${product.id}`,
      productId: product.id,
      name: product.name,
      kind: 'product',
      // a line already discounted by the product does not also take the
      // checkout discount - see the subtotal split below
      discountPercent: productPct,
      discountLabel: productPct ? product.discount_label || null : null,
      listPrice: productPct ? Number(product.price) : null,
      slug: product.slug,
      icon: product.icon,
      accent: product.accent,
      imageUrl: product.image ? `/api/shop/review-images/${encodeURIComponent(product.image)}` : null,
      shortDesc: product.short_desc,
      licenceTerm: product.licence_term,
      price,
      stock: product.stock,
      quantity: line.quantity,
      lineTotal: Math.round(price * line.quantity * 100) / 100,
    });
  }

  const subtotal = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const rates = await store.discountRates();
  const pct = store.PAYMENT_METHODS.includes(method) ? rates[method] : rates.default;

  // A product carrying its own discount has already been marked down, so the
  // checkout discount is not stacked on top of it. Only the rest of the basket is
  // eligible, which is why this is not simply a percentage of the subtotal.
  const eligible = Math.round(
    items.filter((i) => !i.discountPercent).reduce((s, i) => s + i.lineTotal, 0) * 100
  ) / 100;
  const alreadyDiscounted = Math.round((subtotal - eligible) * 100) / 100;
  const discount = pct > 0 ? Math.round(eligible * (pct / 100) * 100) / 100 : 0;

  return {
    items,
    subtotal,
    discount,
    discountPercent: pct,
    // what the checkout discount was allowed to apply to, so the summary can explain
    // itself instead of showing a percentage that does not match the arithmetic
    discountableSubtotal: eligible,
    alreadyDiscounted,
    // every method's rate, so the checkout page can show what each one saves and
    // update the total the moment one is picked
    discountRates: rates,
    paymentMethod: store.PAYMENT_METHODS.includes(method) ? method : null,
    total: Math.round(Math.max(0, subtotal - discount) * 100) / 100,
    count: items.reduce((s, i) => s + i.quantity, 0),
    removed,
  };
}

router.post(
  '/cart/price',
  asyncRoute(async (req, res) => {
    res.json({ cart: await priceCart(req.body.items, req.body.paymentMethod) });
  })
);

/* ================= checkout ================= */
router.post(
  '/checkout',
  asyncRoute(async (req, res) => {
    // the method decides the discount, so resolve it before pricing
    const method = store.PAYMENT_METHODS.includes(req.body.paymentMethod) ? req.body.paymentMethod : 'card';

    const cart = await priceCart(req.body.items, method);
    if (!cart.items.length) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();

    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    for (const item of cart.items) {
      if (item.stock < item.quantity) {
        return res.status(409).json({ error: `Only ${item.stock} licence(s) of ${item.name} are left.` });
      }
    }

    // bank transfer and cash settle later; every other method is treated as captured
    const deferred = store.DEFERRED_METHODS.includes(method);
    const paymentStatus = deferred ? 'pending' : 'paid';
    const orderStatus = deferred ? 'pending' : 'completed';
    const orderNumber = await store.nextOrderNumber();
    const userId = req.session.user ? req.session.user.id : null;

    const order = await db.run(
      `INSERT INTO orders (order_number, user_id, customer_name, customer_email, customer_phone,
                           subtotal, discount, total, payment_method, payment_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNumber, userId, name, email, phone || null,
       cart.subtotal, cart.discount, cart.total, method, paymentStatus, orderStatus]
    );

    for (const item of cart.items) {
      // the stored name spells out what was bought, so old orders stay readable
      // even if the package is later renamed or removed
      const lineName = item.packageName
        ? `${item.name} - ${item.packageName} (${store.licenseLabel(item.licenseType)})`
        : item.kind === 'addon'
        ? `${item.name} (${store.licenseLabel(item.licenseType)})`
        : item.name;

      const oi = await db.run(
        `INSERT INTO order_items (order_id, product_id, package_id, addon_id, license_type,
                                  product_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.insertId, item.productId || null, item.packageId || null, item.addonId || null,
         item.licenseType || null, lineName, item.price, item.quantity, item.lineTotal]
      );

      if (item.kind !== 'addon' && item.productId) {
        await db.run('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [
          item.quantity, item.productId,
        ]);
      }

      if (paymentStatus === 'paid') {
        // an agency package carries several licences, so issue one key per licence
        const keys = item.quantity * (item.licenseCount || 1);
        // the product's own licence term decides when the key runs out - a lifetime
        // product issues a key with no expiry at all
        const expires = store.licenceExpiry(item.licenceTerm);
        for (let n = 0; n < keys; n++) {
          await db.run(
            `INSERT INTO licenses (order_item_id, order_id, product_id, user_id, license_key, status, expires_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?)`,
            [oi.insertId, order.insertId, item.productId || null, userId, store.licenseKey(), expires]
          );
        }
      }
    }

    if (userId) {
      await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "order", ?)', [
        userId, `New order placed #${orderNumber}`,
      ]);
    }

    // lets a guest view the confirmation page for the order they just placed
    if (!req.session.guestOrders) req.session.guestOrders = [];
    req.session.guestOrders.push(orderNumber);

    // The keys email is the promise made at checkout. It must never fail the order,
    // so it is fired after the response and its outcome is only logged.
    if (paymentStatus === 'paid') {
      mailer.sendOrderKeys(order.insertId).catch((err) =>
        console.error('[mail] order keys:', err.message)
      );
    }

    res.status(201).json({ orderNumber, total: cart.total });
  })
);

/* ================= order confirmation ================= */
router.get(
  '/orders/:number',
  asyncRoute(async (req, res) => {
    const order = await db.one('SELECT * FROM orders WHERE order_number = ?', [req.params.number]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const user = req.session.user;
    const isOwner = user && order.user_id === user.id;
    const isAdmin = user && user.role === 'admin';
    const isGuest = (req.session.guestOrders || []).includes(order.order_number);
    if (!isOwner && !isAdmin && !isGuest) {
      return res.status(403).json({ error: 'Please sign in to view that order.' });
    }

    const [items, licenses] = await Promise.all([
      db.query(
        `SELECT oi.*, p.slug, p.icon, p.accent FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
        [order.id]
      ),
      db.query(
        `SELECT l.license_key, l.status, l.expires_at, p.name AS product_name
         FROM licenses l LEFT JOIN products p ON p.id = l.product_id WHERE l.order_id = ?`,
        [order.id]
      ),
    ]);

    res.json({
      order: {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        total: Number(order.total),
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        status: order.status,
        createdAt: order.created_at,
      },
      items: items.map((i) => ({
        productName: i.product_name, slug: i.slug, icon: i.icon, accent: i.accent,
        unitPrice: Number(i.unit_price), quantity: i.quantity, lineTotal: Number(i.line_total),
      })),
      licenses: licenses.map((l) => ({
        key: l.license_key, status: l.status, expiresAt: l.expires_at, productName: l.product_name,
      })),
    });
  })
);

/* ================= demos ================= */
router.get(
  '/demos',
  asyncRoute(async (req, res) => {
    // ?product=<slug> narrows the page to one product's demos
    const productSlug = String(req.query.product || '').trim();

    let where = "WHERE d.status = 'published' AND d.visibility = 'public'";
    const params = [];

    let product = null;
    if (productSlug) {
      product = await db.one('SELECT id, name, slug FROM products WHERE slug = ?', [productSlug]);
      if (product) {
        where += ' AND d.product_id = ?';
        params.push(product.id);
      }
    }

    const rows = await db.query(
      `SELECT d.*, p.name AS product_name, p.slug AS product_slug, p.image AS product_image
       FROM demos d LEFT JOIN products p ON p.id = d.product_id
       ${where}
       ORDER BY d.sort_order, d.id`,
      params
    );

    const total = Number(
      await db.scalar("SELECT COUNT(*) AS v FROM demos WHERE status = 'published' AND visibility = 'public'")
    );

    // the Preview button shows the product's own screenshots, so fetch them in one go
    const previews = await store.previewsByProduct(rows.map((d) => d.product_id));

    res.json({
      product: product ? { id: product.id, name: product.name, slug: product.slug } : null,
      total,
      demos: rows.map((d) => ({
        id: d.id, title: d.title, slug: d.slug, description: d.description,
        platform: d.platform, webUrl: d.web_url, reviewUrl: d.review_url,
        hasApk: Boolean(d.apk_file), apkName: d.apk_name, apkSize: d.apk_size,
        apkVersion: d.apk_version, apkUploadedAt: d.apk_uploaded_at,
        downloadCount: d.download_count,
        productName: d.product_name, productSlug: d.product_slug,
        productImage: d.product_image
          ? `/api/shop/review-images/${encodeURIComponent(d.product_image)}`
          : null,
        previewImages: previews.get(d.product_id) || [],
      })),
    });
  })
);

/** Public download of a demo's mobile build, where the demo is marked public. */
router.get(
  '/demos/:id/apk',
  asyncRoute(async (req, res) => {
    const { apkPath, buildMime, buildFileName } = require('../upload');
    const demo = await db.one(
      "SELECT * FROM demos WHERE id = ? AND status = 'published' AND visibility = 'public'",
      [req.params.id]
    );
    if (!demo || !demo.apk_file) return res.status(404).json({ error: 'That build is not available.' });

    const file = apkPath(demo.apk_file);
    if (!file) return res.status(410).json({ error: 'The build file is missing from the server.' });

    await db.run('UPDATE demos SET download_count = download_count + 1 WHERE id = ?', [demo.id]);
    await db.run('INSERT INTO download_log (demo_id, user_id, ip_address) VALUES (?, ?, ?)', [
      demo.id, req.session.user ? req.session.user.id : null, req.ip,
    ]);

    res.type(buildMime(demo.apk_file));
    return res.download(file, buildFileName(demo.apk_file, demo.apk_name, demo.slug));
  })
);

/* ================= contact & newsletter ================= */
router.post(
  '/contact',
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const message = String(req.body.message || '').trim();
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Please fill in your name, email and message.' });
    }
    await db.run('INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)', [
      name, email, String(req.body.subject || '').trim() || null, message,
    ]);
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/subscribe',
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    await db.run('INSERT INTO newsletter_subscribers (email) VALUES (?) ON DUPLICATE KEY UPDATE is_active = 1', [email]);
    mailer.sendSubscribeWelcome(email).catch((err) => console.error('[mail] welcome:', err.message));
    res.status(201).json({ ok: true });
  })
);

/**
 * One-click unsubscribe, reached from the List-Unsubscribe header and the footer link.
 *
 * Public by design - a subscriber has no account and must not need one to leave. The
 * signed token is what makes that safe: it proves the request came from a message we
 * actually sent to that address, so nobody can unsubscribe a stranger.
 *
 * GET  - a person clicked the link, so answer with a page they can read.
 * POST - the mail client did it on their behalf (RFC 8058), so answer with a status.
 */
async function unsubscribe(req, res) {
  const email = String(req.query.e || req.body.e || '').trim().toLowerCase();
  const token = String(req.query.t || req.body.t || '').trim();
  const wantsPage = req.method === 'GET';

  const expected = email ? mailer.unsubscribeToken(email) : '';
  const ok = Boolean(email) && token.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));

  if (!ok) {
    if (!wantsPage) return res.status(400).json({ error: 'That unsubscribe link is not valid.' });
    return res.status(400).type('html').send(page(
      'That link is not valid',
      'It may have been altered in transit. Reply to any of our emails and we will remove you by hand.'
    ));
  }

  // A customer who never joined the newsletter still receives announcements, so
  // unsubscribing has to be able to record an opt-out for an address that has no row
  // yet - otherwise the UPDATE matches nothing and they keep getting mail.
  await db.run(
    'INSERT INTO newsletter_subscribers (email, is_active) VALUES (?, 0)'
      + ' ON DUPLICATE KEY UPDATE is_active = 0',
    [email]
  );

  if (!wantsPage) return res.json({ ok: true });
  res.type('html').send(page(
    'You are unsubscribed',
    `We will not email <b>${email.replace(/[&<>"]/g, '')}</b> again. If this was a mistake, you can subscribe again from the store footer.`
  ));
}

/** A tiny standalone page - this is reached from an inbox, not from the app. */
function page(heading, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#334155;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:30px;max-width:460px">
    <h1 style="margin:0 0 10px;font-size:19px;color:#0f172a">${heading}</h1>
    <p style="margin:0;font-size:14px;line-height:1.65">${body}</p>
  </div>
</body></html>`;
}

router.get('/unsubscribe', asyncRoute(unsubscribe));
router.post('/unsubscribe', asyncRoute(unsubscribe));

module.exports = router;
