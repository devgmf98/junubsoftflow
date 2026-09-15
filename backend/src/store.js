'use strict';

/** Shared store helpers: settings, licence keys, order numbers. */

const db = require('./db');

/** All settings as a flat { key: value } map. */
async function settings() {
  const rows = await db.query('SELECT setting_key, setting_value FROM settings');
  const out = {};
  for (const r of rows) out[r.setting_key] = r.setting_value;
  return out;
}

/**
 * Preview screenshots for a set of products, keyed by product id.
 * Demo cards use these for their Preview slider, so one query covers a whole page.
 */
async function previewsByProduct(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  const byProduct = new Map();
  if (!ids.length) return byProduct;

  const rows = await db.query(
    `SELECT product_id, id, file_name, caption FROM product_images
     WHERE product_id IN (${ids.map(() => '?').join(',')})
     ORDER BY sort_order, id`,
    ids
  );
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, []);
    byProduct.get(r.product_id).push({
      id: r.id,
      caption: r.caption,
      url: `/api/shop/review-images/${encodeURIComponent(r.file_name)}`,
    });
  }
  return byProduct;
}

const SPLIT_LINES = new RegExp('\r?\n');

/** Licence terms an admin may pick from when adding a product. */
const DEFAULT_LICENCE_TERMS = [
  'Lifetime',
  '1 Year Subscription',
  '2 Year Subscription',
  '3 Year Subscription',
  'Monthly Subscription',
  'Perpetual with 1 Year Updates',
];

/**
 * The licence-term list the admin maintains in Settings, stored one per line.
 * Falls back to the defaults so the product form is never an empty dropdown.
 */
async function licenceTerms() {
  const raw = await db.scalar(
    "SELECT setting_value AS v FROM settings WHERE setting_key = 'licence_terms'",
    [],
    ''
  );
  const list = String(raw || '')
    .split(SPLIT_LINES)
    .map((t) => t.trim())
    .filter(Boolean);

  // de-duplicate while keeping the admin's ordering
  const seen = new Set();
  const out = [];
  for (const t of list.length ? list : DEFAULT_LICENCE_TERMS) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * When a licence bought today runs out, from the product's licence term.
 *
 * Returns a YYYY-MM-DD string, or null for a licence that never expires. Anything
 * we cannot read as a duration is treated as perpetual - handing a customer a wrong
 * expiry date is worse than handing them none.
 */
function licenceExpiry(term, from = new Date()) {
  const text = String(term || '').trim();
  if (!text) return null;

  // Perpetual is checked first: "Perpetual with 1 Year Updates" is not a 1-year licence.
  if (/perpetual|lifetime|life[ -]?time|forever|unlimited/i.test(text)) return null;

  // A plain number and unit: "1 Year Subscription", "6 Months", "90 Days".
  let n = null;
  let unit = null;
  const numbered = text.match(/(\d+)\s*(year|yr|month|mo|week|wk|day)/i);
  if (numbered) {
    n = Number(numbered[1]);
    unit = numbered[2].toLowerCase();
  } else {
    // Worded periods carry no digit: "Monthly Subscription", "Annual Plan".
    const worded = [
      [/annual|yearly/i, 1, 'year'],
      [/quarterly/i, 3, 'month'],
      [/monthly/i, 1, 'month'],
      [/weekly/i, 1, 'week'],
      [/daily/i, 1, 'day'],
    ].find((row) => row[0].test(text));
    if (worded) {
      n = worded[1];
      unit = worded[2];
    }
  }

  // Anything we cannot read as a duration is treated as perpetual - handing a customer
  // a wrong expiry date is worse than handing them none.
  if (!unit || !Number.isFinite(n) || n <= 0) return null;

  const d = new Date(from.getTime());
  if (unit.startsWith('year') || unit === 'yr') d.setFullYear(d.getFullYear() + n);
  else if (unit.startsWith('month') || unit === 'mo') d.setMonth(d.getMonth() + n);
  else if (unit.startsWith('week') || unit === 'wk') d.setDate(d.getDate() + n * 7);
  else d.setDate(d.getDate() + n);

  return d.toISOString().slice(0, 10);
}


/** Checkout discount percentage configured by the admin. */
/** A percentage is only usable if it is a real number in 0-90. */
function cleanPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 90 ? n : 0;
}

/** The settings key holding a payment method's own discount. */
function discountKey(method) {
  return `discount_${method}`;
}

/**
 * Checkout discount, per payment method.
 *
 * `checkout_discount` remains the store-wide default. A method with its own
 * `discount_<method>` setting overrides it, which lets a shop reward the cheap
 * rails (mobile money, cash) without giving the same margin away on cards.
 * A method set explicitly to 0 gets no discount, rather than falling back.
 */
async function discountPercent(method) {
  const base = cleanPercent(
    await db.scalar("SELECT setting_value AS v FROM settings WHERE setting_key = 'checkout_discount'", [], '0')
  );
  if (!method || !PAYMENT_METHODS.includes(method)) return base;

  const own = await db.scalar('SELECT setting_value AS v FROM settings WHERE setting_key = ?', [
    discountKey(method),
  ], null);

  // blank or missing means "use the store default"; "0" means "no discount here"
  if (own === null || own === undefined || String(own).trim() === '') return base;
  return cleanPercent(own);
}

/** Every method's effective rate, for pricing a cart before one is chosen. */
async function discountRates() {
  const rows = await db.query('SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE ?', [
    'discount\_%',
  ]);
  const own = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  const base = cleanPercent(
    await db.scalar("SELECT setting_value AS v FROM settings WHERE setting_key = 'checkout_discount'", [], '0')
  );

  const rates = { default: base };
  for (const m of PAYMENT_METHODS) {
    const v = own.get(discountKey(m));
    rates[m] = v === undefined || String(v).trim() === '' ? base : cleanPercent(v);
  }
  return rates;
}

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function licenseKey() {
  const block = () =>
    Array.from({ length: 5 }, () => KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)]).join('');
  return [block(), block(), block(), block()].join('-');
}

/** Next order number in the SOF###### series. */
async function nextOrderNumber() {
  const last = await db.scalar(
    "SELECT MAX(CAST(SUBSTRING(order_number, 4) AS UNSIGNED)) AS v FROM orders WHERE order_number LIKE 'SOF%'",
    [],
    123456
  );
  return 'SOF' + (Number(last) + 1);
}

/** A twelve-month series, filled so every month is present. */
function fillMonths(rows, key = 'ym', valueKey = 'total') {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const map = {};
  for (const r of rows) map[r[key]] = Number(r[valueKey]) || 0;

  const series = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    series.push({ label: MONTHS[d.getMonth()], value: map[ym] || 0 });
  }
  return series;
}

/** Payment methods the store understands. */
const PAYMENT_METHODS = ['card', 'paypal', 'mobile_money', 'bank_transfer', 'cash'];

/**
 * Methods that settle later, so the order stays pending and no licence keys
 * are issued until an admin confirms the money arrived.
 */
const DEFERRED_METHODS = ['bank_transfer', 'cash'];

/** Licence types a package or add-on can be sold under. */
const LICENSE_TYPES = ['regular', 'extended', 'agency'];

const LICENSE_LABELS = {
  regular: 'Regular License',
  extended: 'Extended License',
  agency: 'Agency License',
};

function licenseLabel(type) {
  return LICENSE_LABELS[type] || 'Regular License';
}

/** How a product is priced: one flat price, or tiered packages. */
const PRICING_MODES = ['simple', 'packages'];

/** Platforms a demo can target. */
const DEMO_PLATFORMS = ['web', 'desktop', 'windows', 'mac', 'linux', 'android', 'ios', 'mobile', 'both'];

/** Platforms a mobile build (.apk or .ipa) can sensibly be attached to. */
const MOBILE_PLATFORMS = ['android', 'ios', 'mobile', 'both'];

/**
 * A demo's two build slots, held independently: a demo can ship the Android and
 * the iOS build at once, and uploading one never touches the other.
 *
 * The Android slot lives in the apk_* columns because it predates iOS support, and
 * renaming live columns is a retype that src/schema-sync.js will not perform. Every
 * route and screen maps over this list rather than naming columns, so the asymmetry
 * stops here.
 */
const DEMO_BUILD_SLOTS = [
  {
    os: 'android',
    path: 'apk',
    format: 'APK',
    ext: '.apk',
    title: 'Android build',
    versionKey: 'apkVersion',
    cols: { file: 'apk_file', name: 'apk_name', size: 'apk_size', version: 'apk_version', at: 'apk_uploaded_at' },
  },
  {
    os: 'ios',
    path: 'ipa',
    format: 'IPA',
    ext: '.ipa',
    title: 'iOS build',
    versionKey: 'ipaVersion',
    cols: { file: 'ios_file', name: 'ios_name', size: 'ios_size', version: 'ios_version', at: 'ios_uploaded_at' },
  },
];

/**
 * The builds actually attached to a demo row, shaped for the API.
 * Pass `exists` (upload.apkPath) to have a file that has gone missing from storage
 * flagged rather than offered as a download.
 */
function demoBuilds(row, exists) {
  return DEMO_BUILD_SLOTS.filter((slot) => row[slot.cols.file]).map((slot) => ({
    os: slot.os,
    path: slot.path,
    format: slot.format,
    title: slot.title,
    name: row[slot.cols.name],
    size: Number(row[slot.cols.size]) || 0,
    version: row[slot.cols.version] || null,
    uploadedAt: row[slot.cols.at],
    ...(exists ? { missing: !exists(row[slot.cols.file]) } : {}),
  }));
}

/**
 * Product SKU derived from the name: three letters per word, digits kept whole.
 *   "Microsoft Office 365" -> SF-MICOFF365
 *   "Adobe Photoshop"      -> SF-ADOPHO
 * Callers must still resolve collisions - see uniqueSku().
 */
function skuFrom(name) {
  const core = String(name || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? word : word.slice(0, 3)))
    .join('')
    .slice(0, 12);
  return 'SF-' + (core || 'PROD');
}

/** skuFrom() plus a numeric suffix if that code is already taken. */
async function uniqueSku(name, ignoreId = null) {
  const base = skuFrom(name);
  const params = ignoreId ? [base, `${base}-%`, ignoreId] : [base, `${base}-%`];
  const rows = await db.query(
    `SELECT sku FROM products WHERE (sku = ? OR sku LIKE ?)${ignoreId ? ' AND id <> ?' : ''}`,
    params
  );
  const taken = new Set(rows.map((r) => r.sku));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** Percentage change between two figures. */
function growth(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (!p) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 100);
}

/* ================= per-product discounts ================= */

/**
 * A product's own discount, as a whole percentage between 0 and 95.
 *
 * Anything outside that is treated as no discount rather than trusted: a stray 500
 * would otherwise hand the product away, and a negative would raise the price.
 */
function productDiscount(product) {
  const pct = Number(product && product.discount_percent);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(95, Math.round(pct * 100) / 100);
}

/**
 * What a product actually costs after its own discount.
 *
 * The single place this arithmetic lives, so the card, the detail page, the cart and
 * the order row can never disagree about what a customer owes.
 */
function salePrice(product) {
  const list = Number((product && product.price) || 0);
  const pct = productDiscount(product);
  if (!pct) return Math.round(list * 100) / 100;
  return Math.round(list * (1 - pct / 100) * 100) / 100;
}

module.exports = {
  settings,
  previewsByProduct,
  licenceTerms,
  licenceExpiry,
  DEFAULT_LICENCE_TERMS,
  discountPercent,
  productDiscount,
  salePrice,
  discountRates,
  discountKey,
  licenseKey,
  nextOrderNumber,
  fillMonths,
  growth,
  skuFrom,
  uniqueSku,
  PAYMENT_METHODS,
  DEFERRED_METHODS,
  LICENSE_TYPES,
  LICENSE_LABELS,
  licenseLabel,
  PRICING_MODES,
  DEMO_PLATFORMS,
  MOBILE_PLATFORMS,
  DEMO_BUILD_SLOTS,
  demoBuilds,
};
