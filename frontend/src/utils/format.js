/** Shared formatting helpers. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function money(value, withCents = true) {
  const n = Number(value || 0);
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: withCents ? 2 : 0,
      maximumFractionDigits: withCents ? 2 : 0,
    })
  );
}

export function moneyShort(value) {
  const n = Number(value || 0);
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
}

export function num(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function date(value) {
  const d = toDate(value);
  if (!d) return '-';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function dateTime(value) {
  const d = toDate(value);
  if (!d) return '-';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${date(d)} at ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

export function timeAgo(value) {
  const d = toDate(value);
  if (!d) return '-';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/** Deterministic avatar colour so a person keeps the same swatch. */
export function avatarColor(seed) {
  const palette = [
    'linear-gradient(135deg,#3b82f6,#6366f1)',
    'linear-gradient(135deg,#10b981,#059669)',
    'linear-gradient(135deg,#a855f7,#7c3aed)',
    'linear-gradient(135deg,#f97316,#ea580c)',
    'linear-gradient(135deg,#14b8a6,#0d9488)',
    'linear-gradient(135deg,#ec4899,#db2777)',
  ];
  let hash = 0;
  for (const ch of String(seed || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return palette[hash % palette.length];
}

const STATUS_CLASS = {
  active: 'badge-green',
  completed: 'badge-green',
  paid: 'badge-green',
  published: 'badge-green',
  processing: 'badge-blue',
  new: 'badge-blue',
  open: 'badge-blue',
  pending: 'badge-amber',
  draft: 'badge-gray',
  read: 'badge-gray',
  inactive: 'badge-gray',
  closed: 'badge-gray',
  archived: 'badge-gray',
  replied: 'badge-purple',
  cancelled: 'badge-red',
  suspended: 'badge-red',
  failed: 'badge-red',
  revoked: 'badge-red',
  expired: 'badge-amber',
  refunded: 'badge-amber',
};

export function statusClass(status) {
  return STATUS_CLASS[String(status || '').toLowerCase()] || 'badge-gray';
}

export function label(value) {
  if (!value) return '-';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fileSize(bytes) {
  const b = Number(bytes || 0);
  if (!b) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function pct(part, whole) {
  const w = Number(whole || 0);
  if (!w) return 0;
  return Math.min(100, Math.round((Number(part || 0) / w) * 100));
}

/** Discount percentage between the compare-at price and the price actually charged. */
/**
 * How a discount is announced, everywhere: "50% OFF for Black Friday".
 *
 * One helper so the card, the detail page, the cart and the admin console phrase it
 * identically - a shopper who sees two wordings for one offer trusts neither.
 */
export function offerText(percent, reason) {
  const pct = Number(percent) || 0;
  if (!pct) return '';
  const why = String(reason || '').trim();
  return why ? `${pct}% OFF for ${why}` : `${pct}% OFF`;
}

export function savePercent(price, comparePrice) {
  const p = Number(price || 0);
  const c = Number(comparePrice || 0);
  if (!c || c <= p) return 0;
  return Math.round(((c - p) / c) * 100);
}

/* ---------- demo platforms ---------- */

/** Grouped for the <select>, so related targets sit together. */
export const PLATFORM_GROUPS = [
  ['Web', [['web', 'Web']]],
  [
    'Desktop',
    [
      ['desktop', 'Desktop (any)'],
      ['windows', 'Windows'],
      ['mac', 'macOS'],
      ['linux', 'Linux'],
    ],
  ],
  [
    'Mobile',
    [
      ['android', 'Android'],
      ['ios', 'iOS'],
      ['mobile', 'Mobile (any)'],
    ],
  ],
  ['Combined', [['both', 'Web + Mobile']]],
];

const PLATFORM_META = {
  web: { label: 'Web', icon: 'monitor', accent: 'blue' },
  desktop: { label: 'Desktop', icon: 'monitor', accent: 'blue' },
  windows: { label: 'Windows', icon: 'monitor', accent: 'blue' },
  mac: { label: 'macOS', icon: 'monitor', accent: 'purple' },
  linux: { label: 'Linux', icon: 'code', accent: 'orange' },
  android: { label: 'Android', icon: 'android', accent: 'green' },
  ios: { label: 'iOS', icon: 'phone', accent: 'teal' },
  mobile: { label: 'Mobile', icon: 'phone', accent: 'green' },
  both: { label: 'Web + Mobile', icon: 'monitor', accent: 'purple' },
};

export function platformLabel(value) {
  return PLATFORM_META[value]?.label || label(value);
}

export function platformIcon(value) {
  return PLATFORM_META[value]?.icon || 'monitor';
}

export function platformAccent(value) {
  return PLATFORM_META[value]?.accent || 'blue';
}

/** Platforms an APK build makes sense for. */
export const APK_PLATFORMS = ['android', 'mobile', 'both'];

/* ---------- payment methods ---------- */

export const PAYMENT_METHODS = [
  { value: 'card', label: 'Credit / Debit Card', hint: 'Visa, Mastercard, Amex', settingKey: 'payment_card' },
  { value: 'paypal', label: 'PayPal', hint: 'Pay with your PayPal balance', settingKey: 'payment_paypal' },
  { value: 'mobile_money', label: 'Mobile Money', hint: 'MTN MoMo, Zain Cash and Digi Cash', settingKey: 'payment_mobile_money' },
  { value: 'bank_transfer', label: 'Bank Transfer', hint: 'Keys are released once funds clear', settingKey: 'payment_bank_transfer' },
  { value: 'cash', label: 'Cash Payment', hint: 'Pay in cash at our office on collection', settingKey: 'payment_cash' },
];

/** Methods that settle later, so the order waits for an admin to confirm. */
export const DEFERRED_METHODS = ['bank_transfer', 'cash'];

export const ACCENTS = {
  blue: '#3b82f6',
  green: '#10b981',
  purple: '#a855f7',
  orange: '#f97316',
  teal: '#14b8a6',
};

/** Soft tinted background + solid foreground for a product/category swatch. */
export function accentStyle(accent = 'blue') {
  const color = ACCENTS[accent] || ACCENTS.blue;
  return { background: `${color}1a`, color };
}

/** "4 GB" reads better than "4096 MB" on an upload hint. */
export function limitLabel(mb) {
  const n = Number(mb) || 0;
  if (n >= 1024) {
    const gb = n / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${n} MB`;
}
