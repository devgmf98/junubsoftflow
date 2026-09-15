'use strict';

/** Customer account API: orders, licences, downloads, support. */

const express = require('express');
const db = require('../db');
const store = require('../store');
const { requireAuth, asyncRoute } = require('../middleware/auth');
const { apkPath, filePath, buildMime, buildFileName } = require('../upload');

const router = express.Router();
router.use(requireAuth);

const PER_PAGE = 10;

/** Midnight today - a licence stays usable for the whole of its last day. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ================= dashboard ================= */
router.get(
  '/summary',
  asyncRoute(async (req, res) => {
    const uid = req.session.user.id;

    const [spent, orders, licenses, pending, recentOrders, activity] = await Promise.all([
      db.scalar("SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE user_id = ? AND payment_status = 'paid'", [uid]),
      db.scalar('SELECT COUNT(*) AS v FROM orders WHERE user_id = ?', [uid]),
      db.scalar("SELECT COUNT(*) AS v FROM licenses WHERE user_id = ? AND status = 'active'", [uid]),
      db.scalar("SELECT COUNT(*) AS v FROM orders WHERE user_id = ? AND status IN ('pending','processing')", [uid]),
      db.query(
        `SELECT o.*, (SELECT GROUP_CONCAT(oi.product_name SEPARATOR ', ')
                      FROM order_items oi WHERE oi.order_id = o.id) AS items
         FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 5`,
        [uid]
      ),
      db.query('SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 6', [uid]),
    ]);

    res.json({
      kpis: {
        spent: Number(spent),
        orders: Number(orders),
        licenses: Number(licenses),
        pending: Number(pending),
      },
      recentOrders: recentOrders.map((o) => ({
        orderNumber: o.order_number,
        items: o.items,
        total: Number(o.total),
        status: o.status,
        paymentStatus: o.payment_status,
        createdAt: o.created_at,
      })),
      activity: activity.map((a) => ({
        id: a.id, type: a.type, message: a.message, createdAt: a.created_at,
      })),
    });
  })
);

/* ================= orders ================= */
router.get(
  '/orders',
  asyncRoute(async (req, res) => {
    const uid = req.session.user.id;
    const status = String(req.query.status || '');

    let where = 'WHERE o.user_id = ?';
    const params = [uid];
    if (['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      where += ' AND o.status = ?';
      params.push(status);
    }

    const total = Number(await db.scalar(`SELECT COUNT(*) AS v FROM orders o ${where}`, params));
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), pages);

    const rows = await db.query(
      `SELECT o.*, (SELECT GROUP_CONCAT(oi.product_name SEPARATOR ', ')
                    FROM order_items oi WHERE oi.order_id = o.id) AS items
       FROM orders o ${where} ORDER BY o.created_at DESC LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`,
      params
    );

    res.json({
      orders: rows.map((o) => ({
        orderNumber: o.order_number,
        items: o.items,
        subtotal: Number(o.subtotal),
        discount: Number(o.discount),
        total: Number(o.total),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        status: o.status,
        createdAt: o.created_at,
      })),
      page,
      pages,
      total,
      perPage: PER_PAGE,
    });
  })
);

router.get(
  '/orders/:number',
  asyncRoute(async (req, res) => {
    const order = await db.one('SELECT * FROM orders WHERE order_number = ? AND user_id = ?', [
      req.params.number, req.session.user.id,
    ]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

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
        customerPhone: order.customer_phone,
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

/* ================= licences ================= */
router.get(
  '/licenses',
  asyncRoute(async (req, res) => {
    const rows = await db.query(
      `SELECT l.*, p.name AS product_name, p.slug AS product_slug, p.icon, p.accent, p.licence_term,
              o.order_number
       FROM licenses l
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN orders o ON o.id = l.order_id
       WHERE l.user_id = ? ORDER BY l.issued_at DESC`,
      [req.session.user.id]
    );

    res.json({
      licenses: rows.map((l) => ({
        id: l.id,
        key: l.license_key,
        status: l.status,
        issuedAt: l.issued_at,
        expiresAt: l.expires_at,
        orderNumber: l.order_number,
        productName: l.product_name,
        productSlug: l.product_slug,
        licenceTerm: l.licence_term,
        icon: l.icon,
        accent: l.accent,
      })),
    });
  })
);

/* ================= downloads ================= */
router.get(
  '/downloads',
  asyncRoute(async (req, res) => {
    const uid = req.session.user.id;

    // Everything this account has actually paid for. Listed even when no installer
    // has been attached yet, so a purchase is never invisible here.
    const owned = await db.query(
      `SELECT p.id, p.name, p.slug, p.icon, p.accent, p.image, p.licence_term,
              MIN(o.created_at) AS first_bought,
              SUM(oi.quantity)  AS quantity
       FROM order_items oi
       JOIN orders o   ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ? AND o.payment_status = 'paid'
       GROUP BY p.id
       ORDER BY p.name`,
      [uid]
    );

    // add-ons bought on their own, each with its own deliverables
    const ownedAddons = await db.query(
      `SELECT a.id, a.name, a.description, p.icon, p.accent, p.image,
              MIN(o.created_at) AS first_bought,
              SUM(oi.quantity)  AS quantity,
              GROUP_CONCAT(DISTINCT oi.license_type) AS license_types
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN addons a ON a.id = oi.addon_id
       JOIN products p ON p.id = a.product_id
       WHERE o.user_id = ? AND o.payment_status = 'paid'
       GROUP BY a.id
       ORDER BY a.name`,
      [uid]
    );

    const ownedIds = owned.map((p) => p.id);
    const addonIds = ownedAddons.map((a) => a.id);

    // Packages this account paid for. A file pinned to a package is released only
    // to buyers of that package; files with no package go to every buyer.
    const boughtPackages = await db.query(
      `SELECT DISTINCT oi.package_id, pk.name AS package_name, pk.product_id
       FROM order_items oi
       JOIN orders o    ON o.id = oi.order_id
       JOIN packages pk ON pk.id = oi.package_id
       WHERE o.user_id = ? AND o.payment_status = 'paid' AND oi.package_id IS NOT NULL`,
      [uid]
    );
    const ownedPackageIds = new Set(boughtPackages.map((r) => r.package_id));

    const [files, addonFiles, licences] = await Promise.all([
      ownedIds.length
        ? db.query(
            `SELECT f.*, pk.name AS package_name FROM product_files f
             LEFT JOIN packages pk ON pk.id = f.package_id
             WHERE f.product_id IN (${ownedIds.map(() => '?').join(',')})
             ORDER BY f.platform, f.id`,
            ownedIds
          )
        : [],
      addonIds.length
        ? db.query(
            `SELECT * FROM product_files
             WHERE addon_id IN (${addonIds.map(() => '?').join(',')})
             ORDER BY platform, id`,
            addonIds
          )
        : [],
      db.query(
        `SELECT product_id, COUNT(*) AS c,
                MAX(expires_at) AS newest, SUM(expires_at IS NULL) AS perpetual
         FROM licenses WHERE user_id = ? AND status = 'active' GROUP BY product_id`,
        [uid]
      ),
    ]);

    const licenceCount = {};
    const licenceState = {};
    const today = startOfToday();
    for (const l of licences) {
      licenceCount[l.product_id] = Number(l.c);
      const perpetual = Number(l.perpetual || 0) > 0;
      const newest = l.newest ? new Date(l.newest) : null;
      licenceState[l.product_id] = {
        expiresAt: perpetual ? null : l.newest,
        expired: !perpetual && Boolean(newest) && newest < today,
      };
    }

    const shapeFile = (f) => ({
      id: f.id,
      label: f.label,
      kind: f.kind,
      packageId: f.package_id || null,
      packageName: f.package_name || null,
      platform: f.platform,
      version: f.version,
      size: f.file_size,
      isExternal: Boolean(f.external_url),
      downloadCount: f.download_count,
      // a row can outlive its file on disk; say so rather than offering a dead link
      available: Boolean(f.external_url) || Boolean(filePath(f.file_name)),
    });

    const products = owned.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      icon: p.icon,
      accent: p.accent,
      imageUrl: p.image ? `/api/shop/review-images/${encodeURIComponent(p.image)}` : null,
      licenceTerm: p.licence_term,
      quantity: Number(p.quantity),
      licences: licenceCount[p.id] || 0,
      licenceExpiresAt: licenceState[p.id]?.expiresAt || null,
      licenceExpired: Boolean(licenceState[p.id]?.expired),
      purchasedAt: p.first_bought,
      packages: boughtPackages
        .filter((b) => b.product_id === p.id)
        .map((b) => ({ id: b.package_id, name: b.package_name })),
      files: files
        .filter((f) => f.product_id === p.id)
        .filter((f) => !f.package_id || ownedPackageIds.has(f.package_id))
        .map(shapeFile),
    }));

    // demo builds are open to any signed-in account
    const demos = await db.query(
      `SELECT d.*, p.name AS product_name FROM demos d
       LEFT JOIN products p ON p.id = d.product_id
       WHERE d.status = 'published' ORDER BY d.sort_order`
    );
    const demoPreviews = await store.previewsByProduct(demos.map((d) => d.product_id));

    const addons = ownedAddons.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      accent: a.accent,
      imageUrl: a.image ? `/api/shop/review-images/${encodeURIComponent(a.image)}` : null,
      quantity: Number(a.quantity),
      licenseTypes: String(a.license_types || '').split(',').filter(Boolean),
      purchasedAt: a.first_bought,
      files: addonFiles.filter((f) => f.addon_id === a.id).map(shapeFile),
    }));

    res.json({
      products,
      addons,
      // flat list kept for convenience; the UI groups by product
      files: products.flatMap((p) =>
        p.files.map((f) => ({ ...f, productName: p.name, productSlug: p.slug, icon: p.icon, accent: p.accent }))
      ),
      demos: demos.map((d) => ({
        id: d.id,
        title: d.title,
        platform: d.platform,
        description: d.description,
        webUrl: d.web_url,
        reviewUrl: d.review_url,
        builds: store.demoBuilds(d),
        hasApk: Boolean(d.apk_file),
        hasIpa: Boolean(d.ios_file),
        downloadCount: d.download_count,
        productName: d.product_name,
        previewImages: demoPreviews.get(d.product_id) || [],
      })),
    });
  })
);

/** Download an installer, if this account bought the product. */
router.get(
  '/downloads/file/:id',
  asyncRoute(async (req, res) => {
    const uid = req.session.user.id;
    const file = await db.one(
      `SELECT f.*, p.name AS product_name, a.name AS addon_name, pk.name AS package_name,
              a.product_id AS addon_product_id
       FROM product_files f
       LEFT JOIN products p ON p.id = f.product_id
       LEFT JOIN addons a   ON a.id = f.addon_id
       LEFT JOIN packages pk ON pk.id = f.package_id
       WHERE f.id = ?`,
      [req.params.id]
    );
    if (!file) return res.status(404).json({ error: 'That download is no longer available.' });

    if (file.requires_purchase) {
      // A file hangs off an add-on, a single package, or the product as a whole -
      // check whichever it is. A package file needs that exact package: owning the
      // product on a cheaper tier is not enough.
      const owned = file.addon_id
        ? await db.scalar(
            `SELECT COUNT(*) AS v FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.user_id = ? AND oi.addon_id = ? AND o.payment_status = 'paid'`,
            [uid, file.addon_id]
          )
        : file.package_id
        ? await db.scalar(
            `SELECT COUNT(*) AS v FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.user_id = ? AND oi.package_id = ? AND o.payment_status = 'paid'`,
            [uid, file.package_id]
          )
        : await db.scalar(
            `SELECT COUNT(*) AS v FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.user_id = ? AND oi.product_id = ? AND o.payment_status = 'paid'`,
            [uid, file.product_id]
          );

      if (!Number(owned)) {
        if (file.package_id) {
          return res.status(403).json({
            error: `This download ships with the ${file.package_name} package. Upgrade to it to get this file.`,
          });
        }
        const what = file.addon_name || file.product_name || 'this item';
        return res.status(403).json({ error: `You need to purchase ${what} before downloading it.` });
      }

      // Owning it is not enough: a lapsed licence stops further downloads, so the
      // customer cannot keep pulling updated source after their term has run out.
      // Only products whose licence actually expires are affected - a lifetime
      // licence stores no expiry date and is never blocked.
      const productId = file.product_id || file.addon_product_id;
      if (productId) {
        const live = await db.one(
          `SELECT MAX(expires_at) AS newest, COUNT(*) AS total,
                  SUM(expires_at IS NULL) AS perpetual
           FROM licenses
           WHERE user_id = ? AND product_id = ? AND status <> 'revoked'`,
          [uid, productId]
        );

        const hasPerpetual = Number(live?.perpetual || 0) > 0;
        const newest = live?.newest ? new Date(live.newest) : null;
        const lapsed = Number(live?.total || 0) > 0 && !hasPerpetual && newest && newest < startOfToday();

        if (lapsed) {
          return res.status(403).json({
            error:
              `Your licence for ${file.product_name || 'this product'} expired on ` +
              `${live.newest.toISOString ? live.newest.toISOString().slice(0, 10) : live.newest}. ` +
              'Renew it to download updated source code and builds.',
          });
        }
      }
    }

    await db.run('UPDATE product_files SET download_count = download_count + 1 WHERE id = ?', [file.id]);
    await db.run('INSERT INTO download_log (file_id, user_id, ip_address) VALUES (?, ?, ?)', [file.id, uid, req.ip]);

    if (file.external_url) return res.redirect(file.external_url);

    const onDisk = filePath(file.file_name);
    if (!onDisk) return res.status(410).json({ error: 'That file is missing from the server.' });
    return res.download(onDisk, file.original_name || file.label);
  })
);

/**
 * Download a demo build - /downloads/demo/:id/apk for Android, /ipa for iOS.
 * Registered per slot rather than as one :slot(apk|ipa) route, because Express 5
 * no longer accepts an inline pattern on a parameter.
 */
store.DEMO_BUILD_SLOTS.forEach((slot) => {
  const { file: fileCol, name: nameCol } = slot.cols;

  router.get(
    `/downloads/demo/:id/${slot.path}`,
    asyncRoute(async (req, res) => {
      const demo = await db.one("SELECT * FROM demos WHERE id = ? AND status = 'published'", [req.params.id]);
      if (!demo || !demo[fileCol]) return res.status(404).json({ error: 'That build is not available.' });

      const file = apkPath(demo[fileCol]);
      if (!file) return res.status(410).json({ error: 'The build file is missing from the server.' });

      await db.run('UPDATE demos SET download_count = download_count + 1 WHERE id = ?', [demo.id]);
      await db.run('INSERT INTO download_log (demo_id, user_id, ip_address) VALUES (?, ?, ?)', [
        demo.id, req.session.user.id, req.ip,
      ]);

      res.type(buildMime(demo[fileCol]));
      return res.download(file, buildFileName(demo[fileCol], demo[nameCol], demo.slug));
    })
  );
});

/* ================= support ================= */
router.get(
  '/support',
  asyncRoute(async (req, res) => {
    const uid = req.session.user.id;
    const [tickets, orders] = await Promise.all([
      db.query(
        `SELECT t.*, o.order_number, r.name AS replier_name FROM support_tickets t
         LEFT JOIN orders o ON o.id = t.order_id
         LEFT JOIN users r ON r.id = t.replied_by
         WHERE t.user_id = ? ORDER BY t.created_at DESC`,
        [uid]
      ),
      db.query('SELECT id, order_number FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [uid]),
    ]);

    res.json({
      tickets: tickets.map((t) => ({
        id: t.id, subject: t.subject, message: t.message, status: t.status,
        reply: t.admin_reply, repliedAt: t.replied_at, repliedBy: t.replier_name,
        orderNumber: t.order_number, createdAt: t.created_at,
      })),
      orders: orders.map((o) => ({ id: o.id, orderNumber: o.order_number })),
    });
  })
);

router.post(
  '/support',
  asyncRoute(async (req, res) => {
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    if (!subject || !message) {
      return res.status(400).json({ error: 'Please give your ticket a subject and a message.' });
    }
    await db.run('INSERT INTO support_tickets (user_id, order_id, subject, message) VALUES (?, ?, ?, ?)', [
      req.session.user.id,
      req.body.orderId ? Number(req.body.orderId) : null,
      subject,
      message,
    ]);
    res.status(201).json({ ok: true });
  })
);

module.exports = router;
