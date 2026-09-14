'use strict';

/**
 * Seeds junubsoftflow with the catalogue, orders and customers shown in the
 * SoftFlow reference designs.
 *
 * Usage: npm run seed
 */

require('dotenv').config();

/**
 * The administrator this seed creates.
 *
 * The password used to be the literal 'admin123', which is published in this
 * repository - fine for a demo on a laptop, a handed-out credential the moment the
 * store is reachable from the internet. Supply ADMIN_PASSWORD to choose one, or a
 * strong random one is generated and printed once.
 */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@softflow.com';
const GENERATED = !process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  || require('crypto').randomBytes(12).toString('base64url');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { writePlaceholderBuild } = require('../src/placeholder');
const { licenceExpiry } = require('../src/store');

/* ---------------- roles ---------------- */
const ROLES = [
  ['Administrator', 'administrator', 'Full access to all features', ['view', 'edit', 'delete'], 1],
  ['Manager', 'manager', 'Manage orders and customers', ['view', 'edit'], 1],
  ['Support', 'support', 'Handle customer support', ['view'], 0],
  ['Editor', 'editor', 'Manage content and products', ['view', 'edit'], 0],
];

/* ---------------- categories ---------------- */
const CATEGORIES = [
  ['Productivity', 'productivity', 'Office tools and productivity apps', 'file', 'blue'],
  ['Security', 'security', 'Antivirus and security software', 'shield', 'green'],
  ['Design & Creative', 'design-creative', 'Design and creative software', 'edit', 'purple'],
  ['Business', 'business', 'Business management tools', 'chart', 'orange'],
  ['Developer Tools', 'developer-tools', 'Developer and coding tools', 'code', 'teal'],
];

/* ---------------- products ---------------- */
const PRODUCTS = [
  {
    name: 'Microsoft Office 365',
    slug: 'microsoft-office-365',
    category: 'productivity',
    sku: 'SF-MS365',
    vendor: 'Microsoft',
    short_desc: 'Productivity Suite for Business',
    description:
      'The complete Office suite for business. Word, Excel, PowerPoint and Outlook, kept up to date automatically, with 1TB of cloud storage per user and email hosting on your own domain.',
    price: 99.0,
    compare_price: 149.0,
    stock: 120,
    licence_term: '1 Year Subscription',
    platforms: 'Windows & Mac',
    icon: 'file',
    accent: 'orange',
    rating: 4.5,
    review_count: 124,
    is_featured: 1,
    badge: 'Best Seller',
    features: [
      'Word, Excel, PowerPoint, Outlook',
      '1 Year Subscription',
      'Instant Email Delivery',
      'Works on Windows & Mac',
      '1TB OneDrive cloud storage',
    ],
  },
  {
    name: 'Adobe Photoshop',
    slug: 'adobe-photoshop',
    category: 'design-creative',
    sku: 'SF-PSCC',
    vendor: 'Adobe',
    short_desc: 'Industry-standard image editing',
    description:
      'Photo editing, compositing and digital painting used by designers everywhere. Includes generative fill, RAW editing and every brush engine Photoshop ships with.',
    price: 49.0,
    compare_price: 79.0,
    stock: 85,
    licence_term: '1 Year Subscription',
    platforms: 'Windows & Mac',
    icon: 'edit',
    accent: 'blue',
    rating: 4.7,
    review_count: 96,
    is_featured: 1,
    features: [
      'Full Photoshop desktop app',
      '1 Year Subscription',
      'Instant Email Delivery',
      '100GB cloud storage',
      'Adobe Fonts included',
    ],
  },
  {
    name: 'Windows 11 Pro',
    slug: 'windows-11-pro',
    category: 'productivity',
    sku: 'SF-W11P',
    vendor: 'Microsoft',
    short_desc: 'Operating system for professionals',
    description:
      'Windows 11 Pro with BitLocker encryption, Remote Desktop, Hyper-V and Windows Sandbox. Delivered as a retail licence key you can activate immediately.',
    price: 129.0,
    compare_price: 199.0,
    stock: 60,
    licence_term: 'Lifetime Licence',
    platforms: 'Windows',
    icon: 'monitor',
    accent: 'blue',
    rating: 4.6,
    review_count: 78,
    is_featured: 1,
    features: [
      'Lifetime retail licence key',
      'BitLocker device encryption',
      'Remote Desktop & Hyper-V',
      'Instant Email Delivery',
      'Free feature updates',
    ],
  },
  {
    name: 'Antivirus Pro',
    slug: 'antivirus-pro',
    category: 'security',
    sku: 'SF-AVPRO',
    vendor: 'SoftFlow Labs',
    short_desc: 'Real-time protection for up to 5 devices',
    description:
      'Real-time malware protection, ransomware shielding, a VPN and a password manager, covering up to five devices on one licence.',
    price: 39.0,
    compare_price: 59.0,
    stock: 200,
    licence_term: '1 Year Subscription',
    platforms: 'Windows, Mac & Android',
    icon: 'shield',
    accent: 'green',
    rating: 4.4,
    review_count: 152,
    is_featured: 1,
    features: [
      'Real-time malware protection',
      'Covers up to 5 devices',
      'Built-in VPN & password manager',
      'Instant Email Delivery',
      'Android app included',
    ],
  },
  {
    name: 'QuickBooks Accounting',
    slug: 'quickbooks-accounting',
    category: 'business',
    sku: 'SF-QBACC',
    vendor: 'Intuit',
    short_desc: 'Bookkeeping built for small business',
    description:
      'Invoicing, expense tracking, VAT returns and payroll in one ledger your accountant can work from directly.',
    price: 89.0,
    compare_price: 119.0,
    stock: 45,
    licence_term: '1 Year Subscription',
    platforms: 'Windows & Web',
    icon: 'money',
    accent: 'green',
    rating: 4.3,
    review_count: 64,
    features: ['Invoicing & expense tracking', 'VAT and tax reports', 'Multi-user access', 'Instant Email Delivery'],
  },
  {
    name: 'JetBrains IntelliJ IDEA',
    slug: 'intellij-idea-ultimate',
    category: 'developer-tools',
    sku: 'SF-IJIDEA',
    vendor: 'JetBrains',
    short_desc: 'The IDE professional developers reach for',
    description:
      'Ultimate edition with full framework support, database tools, profiling and remote development built in.',
    price: 149.0,
    compare_price: 199.0,
    stock: 30,
    licence_term: '1 Year Subscription',
    platforms: 'Windows, Mac & Linux',
    icon: 'code',
    accent: 'purple',
    rating: 4.8,
    review_count: 41,
    features: ['Ultimate edition licence', 'All JetBrains frameworks', 'Database & profiling tools', 'Instant Email Delivery'],
  },
  {
    name: 'Zoom Business',
    slug: 'zoom-business',
    category: 'business',
    sku: 'SF-ZOOMB',
    vendor: 'Zoom',
    short_desc: 'Meetings for growing teams',
    description: 'Up to 300 participants, 30-hour meetings, cloud recording, transcripts and company branding.',
    price: 59.0,
    compare_price: 89.0,
    stock: 75,
    licence_term: '1 Year Subscription',
    platforms: 'Windows, Mac, Android & iOS',
    icon: 'users',
    accent: 'blue',
    rating: 4.2,
    review_count: 37,
    features: ['Up to 300 participants', '30-hour meeting limit', 'Cloud recording & transcripts', 'Instant Email Delivery'],
  },
  {
    name: 'CorelDRAW Graphics Suite',
    slug: 'coreldraw-graphics-suite',
    category: 'design-creative',
    sku: 'SF-CDGS',
    vendor: 'Corel',
    short_desc: 'Vector illustration and layout',
    description: 'Vector illustration, page layout, photo editing and typography in one long-standing design suite.',
    price: 119.0,
    compare_price: 179.0,
    stock: 25,
    licence_term: 'Lifetime Licence',
    platforms: 'Windows & Mac',
    icon: 'tag',
    accent: 'teal',
    rating: 4.1,
    review_count: 22,
    features: ['Lifetime licence key', 'Vector & layout tools', 'Photo-Paint included', 'Instant Email Delivery'],
  },
];

/* ---------------- customers from the reference ---------------- */
const CUSTOMERS = [
  ['John Doe', 'john@example.com', '+211 912345678', 'Doe Enterprises', 105],
  ['Sarah Juma', 'sarah@example.com', '+211 923456789', 'Juma Traders', 108],
  ['Ahmed Ali', 'ahmed@example.com', '+211 934567890', 'Ali Logistics', 110],
  ['Mary K.', 'mary@example.com', '+211 925678901', 'Mary Consulting', 112],
  ['Grace Lomoro', 'grace@example.com', '+211 926111222', 'Nile Traders', 76],
  ['Peter Deng', 'peter@example.com', '+211 927333444', 'Deng Logistics', 60],
  ['Rebecca Nyandeng', 'rebecca@example.com', '+211 928555666', 'Sunrise Foods', 44],
  ['Emmanuel Ladu', 'emmanuel@example.com', '+211 929777888', 'Ladu Motors', 25],
];

/* ---------------- reviews ---------------- */
/* [slug, author, rating, title, body, imageCount] - images are generated below */
const REVIEWS = [
  ['microsoft-office-365', 'James Wani', 5, 'Exactly what we needed', 'Key arrived in about two minutes and activated first try. No complaints at all.', 3],
  ['microsoft-office-365', 'Anna Poni', 4, 'Good value', 'Much cheaper than buying direct. Took a few minutes to find the activation instructions but support helped.', 0],
  ['adobe-photoshop', 'Simon Garang', 5, 'Works perfectly', 'Downloaded, signed in, done. Been using it daily for three months.', 4],
  ['windows-11-pro', 'Betty Aluel', 5, 'Genuine key', 'Activated straight away on a fresh install. Would buy again.', 2],
  ['antivirus-pro', 'Michael Taban', 4, 'Solid protection', 'Covers my laptop and both phones. The VPN is a nice extra.', 3],
  ['antivirus-pro', 'Josephine Ayen', 5, 'Great for the price', 'Caught something my old antivirus missed on day one.', 0],
];

/* Captions cycled through the generated review screenshots. */
const SHOT_CAPTIONS = [
  ['Activation screen', 'Licence accepted first try'],
  ['Main workspace', 'Everything where you expect it'],
  ['Settings panel', 'Plenty to configure'],
  ['Mobile app', 'Same account, second device'],
];

const SHOT_TINTS = [
  ['#e0ecff', '#2563eb'],
  ['#d9fbe9', '#059669'],
  ['#f3e8ff', '#7c3aed'],
  ['#ffedd5', '#ea580c'],
];

/**
 * Writes a small SVG "screenshot" for a review. Generating them keeps the seed
 * self-contained - no binary assets to ship, and the slider has real files to show.
 */
function writeReviewImage(dir, name, index, productName) {
  const [caption, sub] = SHOT_CAPTIONS[index % SHOT_CAPTIONS.length];
  const [bg, fg] = SHOT_TINTS[index % SHOT_TINTS.length];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <rect width="640" height="400" fill="${bg}"/>
  <rect x="0" y="0" width="640" height="46" fill="${fg}" opacity="0.9"/>
  <circle cx="24" cy="23" r="6" fill="#ffffff" opacity="0.85"/>
  <circle cx="44" cy="23" r="6" fill="#ffffff" opacity="0.55"/>
  <circle cx="64" cy="23" r="6" fill="#ffffff" opacity="0.35"/>
  <text x="88" y="29" font-family="Inter, Arial, sans-serif" font-size="15" fill="#ffffff">${esc(productName)}</text>
  <rect x="32" y="82" width="240" height="18" rx="5" fill="${fg}" opacity="0.28"/>
  <rect x="32" y="112" width="384" height="12" rx="4" fill="${fg}" opacity="0.16"/>
  <rect x="32" y="134" width="330" height="12" rx="4" fill="${fg}" opacity="0.16"/>
  <rect x="32" y="176" width="264" height="150" rx="10" fill="#ffffff" opacity="0.75"/>
  <rect x="320" y="176" width="288" height="70" rx="10" fill="#ffffff" opacity="0.6"/>
  <rect x="320" y="256" width="288" height="70" rx="10" fill="#ffffff" opacity="0.6"/>
  <text x="32" y="366" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="${fg}">${esc(caption)}</text>
  <text x="32" y="388" font-family="Inter, Arial, sans-serif" font-size="13" fill="${fg}" opacity="0.75">${esc(sub)}</text>
</svg>`;

  fs.writeFileSync(path.join(dir, name), svg, 'utf8');
}

/* ---------------- settings ---------------- */
const SETTINGS = {
  general: {
    site_name: 'SoftFlow',
    site_tagline: 'Software for a smarter tomorrow',
    hero_title: 'The Right Software for Your Business Growth',
    hero_highlight: 'Growth',
    hero_subtitle: 'Powerful. Secure. Scalable',
    hero_banner: 'Buy Software Online - Fast, Secure, and Easy',
    hero_banner_sub: 'Everything you need to power your business. From productivity tools to enterprise solutions - all in one place.',
    support_email: 'support@softflow.com',
    support_phone: '+211 920 000 111',
    office_address: 'Juba, South Sudan',
    timezone: '(UTC+3) Nairobi',
    currency: 'USD',
    // choices for the Licence term dropdown when adding a product, one per line
    licence_terms: [
      'Lifetime',
      '1 Year Subscription',
      '2 Year Subscription',
      '3 Year Subscription',
      'Monthly Subscription',
      'Perpetual with 1 Year Updates',
    ].join('\n'),
  },
  payment: {
    payment_card: '1',
    payment_paypal: '1',
    payment_mobile_money: '1',
    payment_bank_transfer: '1',
    payment_cash: '1',
    checkout_discount: '10',
  },
  email: {
    email_from_name: 'SoftFlow',
    email_from_address: 'no-reply@softflow.com',
    email_order_confirmation: '1',
  },
};

const MS_PER_DAY = 86400000;
const daysAgo = (d) => new Date(Date.now() - d * MS_PER_DAY);
const fmtDT = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const fmtD = (d) => d.toISOString().slice(0, 10);

function licenseKey() {
  const block = () =>
    Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  return [block(), block(), block(), block()].join('-');
}

async function seed() {
  console.log('> clearing existing rows ...');
  await db.run('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of [
    'download_log', 'demos', 'product_files', 'licenses', 'order_items', 'orders',
    'reviews', 'product_features', 'products', 'categories', 'support_tickets',
    'contact_messages', 'newsletter_subscribers', 'activity_log', 'users', 'roles', 'settings',
  ]) {
    await db.run(`TRUNCATE TABLE ${t}`);
  }
  await db.run('SET FOREIGN_KEY_CHECKS = 1');

  /* ---------- roles ---------- */
  const roleId = {};
  for (let i = 0; i < ROLES.length; i++) {
    const [name, slug, description, perms, isSystem] = ROLES[i];
    const r = await db.run(
      'INSERT INTO roles (name, slug, description, permissions, is_system, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [name, slug, description, JSON.stringify(perms), isSystem, i + 1]
    );
    roleId[slug] = r.insertId;
  }
  console.log(`> roles: ${ROLES.length}`);

  /* ---------- users ---------- */
  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const adminId = (
    await db.run(
      `INSERT INTO users (name, email, password_hash, role, role_id, phone, company, country, city, status, last_login_at, created_at)
       VALUES (?, ?, ?, 'admin', ?, '+211 920 000 111', 'SoftFlow', 'South Sudan', 'Juba', 'active', NOW(), ?)`,
      ['Admin', ADMIN_EMAIL, hash(ADMIN_PASSWORD), roleId.administrator, fmtDT(daysAgo(400))]
    )
  ).insertId;

  const customerIds = {};
  for (const [name, email, phone, company, ago] of CUSTOMERS) {
    const r = await db.run(
      `INSERT INTO users (name, email, password_hash, role, phone, company, country, city, status, last_login_at, created_at)
       VALUES (?, ?, ?, 'customer', ?, ?, 'South Sudan', 'Juba', 'active', ?, ?)`,
      [name, email, hash('user123'), phone, company, fmtDT(daysAgo(Math.floor(ago / 20))), fmtDT(daysAgo(ago))]
    );
    customerIds[email] = r.insertId;
  }
  const johnId = customerIds['john@example.com'];
  console.log(`> users: ${CUSTOMERS.length + 1} (1 admin, ${CUSTOMERS.length} customers)`);

  /* ---------- categories ---------- */
  const catId = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    const [name, slug, description, icon, accent] = CATEGORIES[i];
    const r = await db.run(
      'INSERT INTO categories (name, slug, description, icon, accent, status, sort_order) VALUES (?, ?, ?, ?, ?, "active", ?)',
      [name, slug, description, icon, accent, i + 1]
    );
    catId[slug] = r.insertId;
  }
  console.log(`> categories: ${CATEGORIES.length}`);

  /* ---------- products + features ---------- */
  const prodId = {};
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const r = await db.run(
      `INSERT INTO products (name, slug, category_id, sku, vendor, short_desc, description, price, compare_price,
                             stock, licence_term, platforms, badge, icon, accent, rating, review_count,
                             is_featured, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        p.name, p.slug, catId[p.category], p.sku, p.vendor, p.short_desc, p.description,
        p.price, p.compare_price, p.stock, p.licence_term, p.platforms, p.badge || null,
        p.icon, p.accent, p.rating, p.review_count, p.is_featured || 0, i + 1, fmtDT(daysAgo(200 - i * 12)),
      ]
    );
    prodId[p.slug] = r.insertId;

    for (let f = 0; f < p.features.length; f++) {
      await db.run('INSERT INTO product_features (product_id, label, sort_order) VALUES (?, ?, ?)', [
        r.insertId, p.features[f], f + 1,
      ]);
    }
  }
  console.log(`> products: ${PRODUCTS.length}`);

  /* ---------- reviews (with generated screenshots for the slider) ---------- */
  const imageDir = path.join(__dirname, '..', 'storage', 'images');
  fs.mkdirSync(imageDir, { recursive: true });

  // clear previously seeded shots so re-seeding does not pile up orphans
  for (const f of fs.readdirSync(imageDir)) {
    if (f.startsWith('seed-review-')) fs.unlinkSync(path.join(imageDir, f));
  }

  let imageCount = 0;
  for (let i = 0; i < REVIEWS.length; i++) {
    const [slug, author, rating, title, body, shots] = REVIEWS[i];
    const productName = PRODUCTS.find((p) => p.slug === slug).name;

    const images = [];
    for (let n = 0; n < shots; n++) {
      const name = `seed-review-${i + 1}-${n + 1}.svg`;
      writeReviewImage(imageDir, name, n, productName);
      images.push(name);
      imageCount++;
    }

    await db.run(
      `INSERT INTO reviews (product_id, author, rating, title, body, images, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?)`,
      [
        prodId[slug], author, rating, title, body,
        images.length ? JSON.stringify(images) : null,
        fmtDT(daysAgo(Math.floor(Math.random() * 90) + 5)),
      ]
    );
  }
  console.log(`> reviews: ${REVIEWS.length} (${imageCount} images generated)`);

  /* ---------- product files (installers + the Android build) ---------- */
  const FILES = [
    ['microsoft-office-365', 'Office 365 Installer', 'windows', '16.0.17328', null],
    ['microsoft-office-365', 'Office 365 for Mac', 'mac', '16.83', null],
    ['adobe-photoshop', 'Photoshop Installer', 'windows', '25.9', null],
    ['windows-11-pro', 'Windows 11 Pro ISO', 'windows', '23H2', 'https://www.microsoft.com/software-download/windows11'],
    ['antivirus-pro', 'Antivirus Pro for Windows', 'windows', '8.2.1', null],
    ['antivirus-pro', 'Antivirus Pro for Android', 'android', '8.2.1', null],
  ];

  const fileDir = path.join(__dirname, '..', 'storage', 'files');
  fs.mkdirSync(fileDir, { recursive: true });
  for (const f of fs.readdirSync(fileDir)) {
    if (f.startsWith('seed-')) fs.unlinkSync(path.join(fileDir, f));
  }

  for (const [slug, label, platform, version, url] of FILES) {
    // rows backed by an external link need no local file; the rest get a real
    // placeholder archive so every download link resolves to something
    let build = { fileName: null, originalName: null, size: null };
    if (!url) {
      build = writePlaceholderBuild(fileDir, {
        product: PRODUCTS.find((p) => p.slug === slug).name,
        label,
        platform,
        version,
      });
    }

    await db.run(
      `INSERT INTO product_files (product_id, label, platform, version, file_name, original_name,
                                  file_size, external_url, requires_purchase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [prodId[slug], label, platform, version, build.fileName, build.originalName, build.size, url]
    );
  }
  console.log(`> product files: ${FILES.length} (${FILES.filter((f) => !f[4]).length} placeholder builds written)`);

  /* ---------- orders ---------- */
  // the four orders shown in the reference, then a spread of history
  const REF_ORDERS = [
    ['SOF123456', 'john@example.com', [['microsoft-office-365', 1], ['adobe-photoshop', 1]], 10, 'card', 'completed', 4],
    ['SOF123450', 'sarah@example.com', [['adobe-photoshop', 1]], 0, 'mobile_money', 'processing', 5],
    ['SOF123400', 'ahmed@example.com', [['microsoft-office-365', 1]], 0, 'bank_transfer', 'pending', 6],
    ['SOF123448', 'mary@example.com', [['windows-11-pro', 1]], 0, 'card', 'completed', 7],
  ];

  const priceOf = {};
  for (const p of PRODUCTS) priceOf[p.slug] = p.price;

  let orderCount = 0;
  let itemCount = 0;
  let licenseCount = 0;

  async function createOrder(number, email, items, discount, method, status, agoDays) {
    const user = await db.one('SELECT id, name, email, phone FROM users WHERE email = ?', [email]);
    const subtotal = items.reduce((s, [slug, qty]) => s + priceOf[slug] * qty, 0);
    const total = subtotal - discount;
    const when = daysAgo(agoDays);
    const payStatus = status === 'pending' ? 'pending' : status === 'cancelled' ? 'refunded' : 'paid';

    const o = await db.run(
      `INSERT INTO orders (order_number, user_id, customer_name, customer_email, customer_phone,
                           subtotal, discount, total, payment_method, payment_status, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [number, user.id, user.name, user.email, user.phone, subtotal, discount, total, method, payStatus, status, fmtDT(when)]
    );
    orderCount++;

    for (const [slug, qty] of items) {
      const unit = priceOf[slug];
      const oi = await db.run(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [o.insertId, prodId[slug], PRODUCTS.find((p) => p.slug === slug).name, unit, qty, unit * qty]
      );
      itemCount++;

      if (payStatus === 'paid') {
        // expiry follows the product's own licence term, exactly as checkout does
        const term = PRODUCTS.find((p) => p.slug === slug).licence_term;
        const expires = licenceExpiry(term, new Date(when));
        await db.run(
          `INSERT INTO licenses (order_item_id, order_id, product_id, user_id, license_key, status, issued_at, expires_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
          [oi.insertId, o.insertId, prodId[slug], user.id, licenseKey(), fmtDT(when), expires]
        );
        licenseCount++;
      }
    }
    return o.insertId;
  }

  for (const [num, email, items, disc, method, status, ago] of REF_ORDERS) {
    await createOrder(num, email, items, disc, method, status, ago);
  }

  // extra history so the dashboard charts and reports have twelve months of data
  const slugs = PRODUCTS.map((p) => p.slug);
  const emails = CUSTOMERS.map((c) => c[1]);
  const methods = ['card', 'paypal', 'mobile_money', 'bank_transfer', 'cash'];
  const statuses = ['completed', 'completed', 'completed', 'processing', 'pending', 'cancelled'];
  let seq = 123000;

  for (let i = 0; i < 60; i++) {
    const email = emails[i % emails.length];
    const created = await db.one('SELECT created_at FROM users WHERE email = ?', [email]);
    const maxAgo = Math.max(3, Math.floor((Date.now() - new Date(created.created_at).getTime()) / MS_PER_DAY));
    const ago = 3 + ((i * 17) % Math.max(4, maxAgo - 3));

    const items = [[slugs[(i * 3) % slugs.length], 1]];
    if (i % 4 === 0) items.push([slugs[(i * 5 + 1) % slugs.length], 1]);

    await createOrder(
      'SOF' + ++seq,
      email,
      items,
      i % 6 === 0 ? 10 : 0,
      methods[i % methods.length],
      statuses[i % statuses.length],
      ago
    );
  }
  console.log(`> orders: ${orderCount} (${itemCount} items, ${licenseCount} licences)`);

  /* ---------- demos (admin-published review links + APK) ---------- */
  const DEMOS = [
    {
      title: 'Antivirus Pro - Android Beta',
      slug: 'antivirus-pro-android-beta',
      product: 'antivirus-pro',
      description: 'The Android build of Antivirus Pro. Enable "Install unknown apps" for your browser before installing the APK.',
      platform: 'android',
      web_url: null,
      review_url: 'https://review.softflow.com/antivirus-pro/beta-notes',
      apk_version: '8.2.1-beta',
      visibility: 'public',
    },
    {
      title: 'SoftFlow Store - Live Demo',
      slug: 'softflow-store-demo',
      product: null,
      description: 'A sandbox copy of the storefront with test checkout enabled. No real payments are taken.',
      platform: 'both',
      web_url: 'https://demo.softflow.com/store',
      review_url: 'https://review.softflow.com/store/walkthrough',
      apk_version: '1.4.0',
      visibility: 'public',
    },
    {
      title: 'Office 365 - Guided Walkthrough',
      slug: 'office-365-walkthrough',
      product: 'microsoft-office-365',
      description: 'A recorded walkthrough of activation and first-run setup, for buyers who want to see it before purchasing.',
      platform: 'web',
      web_url: 'https://demo.softflow.com/office365',
      review_url: 'https://review.softflow.com/office365',
      visibility: 'public',
    },
  ];

  for (let i = 0; i < DEMOS.length; i++) {
    const d = DEMOS[i];
    await db.run(
      `INSERT INTO demos (title, slug, product_id, description, platform, web_url, review_url,
                          apk_version, visibility, status, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
      [d.title, d.slug, d.product ? prodId[d.product] : null, d.description, d.platform,
       d.web_url, d.review_url, d.apk_version || null, d.visibility, i + 1, adminId]
    );
  }
  console.log(`> demos: ${DEMOS.length} (upload APKs from the admin Demos page)`);

  /* ---------- support tickets ---------- */
  const TICKETS = [
    [johnId, 'Activation code not working', 'I entered the key for Office 365 and it says already in use. Order SOF123456.', 'open'],
    [customerIds['sarah@example.com'], 'Need an invoice', 'Could you send a VAT invoice for my Photoshop order?', 'pending'],
    [customerIds['mary@example.com'], 'Reinstall on a new laptop', 'My laptop died. Can I move the Windows 11 licence?', 'closed'],
  ];
  for (const [uid, subject, message, status] of TICKETS) {
    await db.run('INSERT INTO support_tickets (user_id, subject, message, status) VALUES (?, ?, ?, ?)', [
      uid, subject, message, status,
    ]);
  }
  console.log(`> support tickets: ${TICKETS.length}`);

  /* ---------- contact messages ---------- */
  const MESSAGES = [
    ['Betty Aluel', 'betty@example.com', 'Bulk licence pricing', 'We need 25 Office 365 licences. Do you offer a discount at that volume?', 'new'],
    ['Michael Taban', 'michael@example.com', 'Does Antivirus Pro cover Android?', 'I have two Android phones and a Windows laptop. Is one licence enough?', 'new'],
    ['Josephine Ayen', 'josephine@example.com', 'Payment failed', 'My mobile money payment was deducted but the order did not complete.', 'read'],
    ['Daniel Majok', 'daniel@example.com', 'Refund request', 'I bought the wrong version of Windows. Can I exchange it?', 'replied'],
  ];
  for (const [name, email, subject, message, status] of MESSAGES) {
    await db.run('INSERT INTO contact_messages (name, email, subject, message, status) VALUES (?, ?, ?, ?, ?)', [
      name, email, subject, message, status,
    ]);
  }
  console.log(`> contact messages: ${MESSAGES.length}`);

  /* ---------- newsletter ---------- */
  for (const e of emails.slice(0, 5)) {
    await db.run('INSERT INTO newsletter_subscribers (email) VALUES (?)', [e]);
  }

  /* ---------- activity ---------- */
  const ACTIVITY = [
    [johnId, 'order', 'New order placed #SOF123456', 2],
    [johnId, 'payment', 'Payment received $138.00', 12],
    [customerIds['sarah@example.com'], 'order', 'New order placed #SOF123450', 60],
    [adminId, 'product', 'Product updated: Windows 11 Pro', 180],
    [customerIds['ahmed@example.com'], 'account', 'New customer registered', 420],
    [adminId, 'settings', 'Store settings updated', 900],
  ];
  for (const [uid, type, message, mins] of ACTIVITY) {
    await db.run('INSERT INTO activity_log (user_id, type, message, created_at) VALUES (?, ?, ?, ?)', [
      uid, type, message, fmtDT(new Date(Date.now() - mins * 60000)),
    ]);
  }

  /* ---------- settings ---------- */
  let settingCount = 0;
  for (const [group, entries] of Object.entries(SETTINGS)) {
    for (const [k, v] of Object.entries(entries)) {
      await db.run('INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)', [k, v, group]);
      settingCount++;
    }
  }
  console.log(`> settings: ${settingCount}`);

  console.log('\nSeed complete.');
  console.log(`  admin login:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  if (GENERATED) {
    console.log('');
    console.log('  ^ generated for this seed and shown once. Save it now, or set');
    console.log('    ADMIN_PASSWORD before seeding to choose your own.');
  }
  console.log('  customer:     john@example.com   / user123   (demo data)');

  await db.pool.end();
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
