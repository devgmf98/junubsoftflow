'use strict';

/**
 * Outgoing email.
 *
 * Credentials live in .env (they are secrets); the visible from-name and reply-to
 * come from Settings -> Email so an admin can change them without a deploy.
 *
 * When SMTP is not configured the app does NOT pretend to send: every call returns
 * `{ sent: false, reason: 'not-configured' }` and logs a line. Callers must treat a
 * failed send as non-fatal - an order is still paid and its keys still issued even if
 * the receipt cannot go out.
 *
 * Deliverability is part of the job here, not an afterthought. Two rules earn their
 * keep, because breaking either is what puts a message in the spam folder:
 *
 *  1. Never embed a link a recipient cannot open. A URL pointing at localhost, a
 *     private IP or a domain that does not resolve is the shape of phishing, and
 *     filters score it as such. With no public address configured we send the message
 *     without links rather than with broken ones.
 *  2. Bulk mail carries List-Unsubscribe. Gmail's bulk sender rules expect it, and a
 *     newsletter without one is filed as spam regardless of content.
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./db');
const store = require('./store');

let cached = null;

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    // 465 is implicit TLS; 587 upgrades with STARTTLS
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true'
      || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  };
}

function transport() {
  const config = smtpConfig();
  if (!config) return null;
  if (!cached) cached = nodemailer.createTransport(config);
  return cached;
}

/** True when the server has somewhere to send mail. */
function isConfigured() {
  return Boolean(smtpConfig());
}

/** localhost, .local, loopback and RFC1918 - reachable here, nowhere else. */
function isPrivateHost(host) {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

/**
 * Validates one candidate address, or returns null.
 *
 * A link the recipient's mail client cannot reach is worse than no link at all -
 * filters read localhost and private-network URLs as phishing. Those are refused
 * unless `allowPrivate` says an admin typed one deliberately, which is a supported
 * choice for local testing and is flagged in the console rather than hidden.
 */
function usableUrl(raw, allowPrivate = false) {
  raw = String(raw || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    // an address typed without a scheme is still what the admin meant; a local one is
    // plain http, because a dev server does not answer TLS
    const bare = raw.split('/')[0].split(':')[0].toLowerCase();
    raw = `${isPrivateHost(bare) ? 'http' : 'https'}://${raw}`;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (!allowPrivate && isPrivateHost(host)) return null;

  return (url.origin + url.pathname).replace(/\/+$/, '');
}

/**
 * The store's public address, or null when there is not a real one yet.
 *
 * Settings -> General wins, because an admin can change it without a deploy and this
 * is not a secret; PUBLIC_URL in .env stays as the fallback for a deployment that
 * would rather pin it. Whatever the source, it has to survive usableUrl() before a
 * single link is printed.
 */
async function publicUrl(settings) {
  const all = settings || (await store.settings());
  // an address typed into Settings is an explicit choice, so a private one is honoured;
  // the env fallback stays strict because nobody is looking at it
  return usableUrl(all.site_url, true) || usableUrl(process.env.PUBLIC_URL);
}

/** True when the configured address only works on this machine. */
function isPrivate(url) {
  if (!url) return false;
  try {
    return isPrivateHost(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Host/port/user, never the password - safe to show in the admin console. */
async function describe() {
  const config = smtpConfig();
  const site = await publicUrl();
  if (!config) return { configured: false, publicUrl: site, publicUrlIsPrivate: isPrivate(site) };
  return {
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth ? config.auth.user : null,
    // the console warns about both of these, because they are the usual reasons a
    // message that sent fine still landed in spam
    publicUrl: site,
    publicUrlIsPrivate: isPrivate(site),
  };
}

/** Checks the credentials actually work, without sending anything. */
async function verify() {
  const t = transport();
  if (!t) return { ok: false, error: 'SMTP is not configured. Set SMTP_HOST in backend/.env.' };
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** The mailbox we actually authenticate as - Gmail rewrites From to this anyway. */
function smtpUser() {
  return String(process.env.SMTP_USER || '').trim();
}

/**
 * The store's name, from Settings -> General.
 *
 * Every message signs itself with this, so renaming the store in the admin console
 * renames it in the header, the subject lines and the footers at the same time.
 */
async function siteName(settings) {
  const all = settings || (await store.settings());
  return String(all.site_name || '').trim() || 'SoftFlow';
}

async function fromAddress() {
  const settings = await store.settings();
  // the from-name is its own setting, but an empty one falls back to the store name
  const name = String(settings.email_from_name || '').trim() || (await siteName(settings));
  const address = settings.email_from_address || smtpUser() || 'no-reply@softflow.com';
  return `"${name.replace(/"/g, '')}" <${address}>`;
}

/**
 * A per-address unsubscribe token.
 *
 * Signed rather than stored, so there is no column to migrate and no way to guess
 * another subscriber's link. It stays valid as long as SESSION_SECRET does, which is
 * the right lifetime for something printed in an email.
 */
function unsubscribeToken(email) {
  return crypto
    .createHmac('sha256', String(process.env.SESSION_SECRET || 'softflow'))
    .update(String(email).trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

function unsubscribeUrl(email, site) {
  if (!site) return null;
  return `${site}/api/shop/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

/**
 * The headers that keep bulk mail out of the spam folder.
 *
 * mailto: alone is a valid List-Unsubscribe and works with no website at all, so the
 * header is always present. One-click needs an https endpoint, so it is added only
 * once the store has a public address.
 */
async function bulkHeaders(email, site) {
  const settings = await store.settings();
  const inbox = settings.support_email || smtpUser();
  if (!inbox) return {};

  const targets = [`<mailto:${inbox}?subject=unsubscribe>`];
  const link = unsubscribeUrl(email, site);
  if (link) targets.unshift(`<${link}>`);

  const headers = { 'List-Unsubscribe': targets.join(', ') };
  // one-click is only honest when there is a URL that can accept the POST
  if (link) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return headers;
}

/**
 * Sends one message. Never throws - a failure here must not roll back a paid order.
 * Every attempt is recorded in email_log so an admin can see what went out.
 */
async function send({ to, subject, html, text, kind = 'other', headers, replyTo }) {
  const t = transport();
  const record = async (status, error) => {
    try {
      await db.run(
        'INSERT INTO email_log (recipient, subject, kind, status, error) VALUES (?, ?, ?, ?, ?)',
        [String(to).slice(0, 160), String(subject).slice(0, 200), kind, status, error ? String(error).slice(0, 300) : null]
      );
    } catch {
      /* logging must never break sending */
    }
  };

  if (!t) {
    console.warn(`[mail] skipped "${subject}" to ${to} - SMTP not configured`);
    await record('skipped', 'SMTP not configured');
    return { sent: false, reason: 'not-configured' };
  }

  const settings = await store.settings();

  try {
    const info = await t.sendMail({
      from: await fromAddress(),
      to,
      // a reply that reaches a person is worth more to a filter than any tuning
      replyTo: replyTo || settings.support_email || undefined,
      subject,
      text: text || stripTags(html || ''),
      html,
      headers,
    });
    await record('sent', null);
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error(`[mail] failed "${subject}" to ${to}:`, err.message);
    await record('failed', err.message);
    return { sent: false, reason: err.message };
  }
}

function stripTags(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

/**
 * The store's name, linked to the storefront.
 *
 * Falls back to plain text when there is no public address, because a wordmark
 * pointing at localhost is exactly the link that gets a message filed as spam. Set
 * PUBLIC_URL and every mention of the store becomes a link on its own.
 */
function nameLink(name, site, style = 'color:#2563eb') {
  // brand blue by default: the store name is the one thing in a footer worth noticing
  if (!site) return esc(name);
  return `<a href="${esc(site)}" style="${style};text-decoration:underline">${esc(name)}</a>`;
}

/**
 * Shared shell so every message looks like it came from the same store.
 *
 * `cta` and any footer link are dropped when there is no public address - see the
 * note at the top of this file.
 */
async function layout({ heading, intro, body = '', cta, footer }) {
  const site = await publicUrl();
  const storeName = await siteName();
  const name = esc(storeName);
  const brandStyle = 'color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;letter-spacing:-.02em';
  const brand = site
    ? `<a href="${esc(site)}" style="${brandStyle}">${name}</a>`
    : `<span style="${brandStyle}">${name}</span>`;
  const button = cta && cta.href
    ? `<p style="margin:22px 0 0"><a href="${esc(cta.href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : '';

  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:28px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#334155">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <tr><td style="background:#0f172a;padding:20px 26px">${brand}</td></tr>
      <tr><td style="padding:26px">
        <h1 style="margin:0 0 10px;font-size:19px;color:#0f172a">${esc(heading)}</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6">${intro}</p>
        ${body}
        ${button}
      </td></tr>
      <tr><td style="padding:16px 26px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#94a3b8">
        ${footer || `You are receiving this because you have an account at ${nameLink(storeName, site)}.`}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** The unsubscribe line, as a real link when we can offer one. */
function unsubscribeFooter(email, name, site) {
  const store = nameLink(name, site);
  const link = unsubscribeUrl(email, site);
  if (link) {
    return `You subscribed to updates from ${store}. <a href="${esc(link)}" style="color:#2563eb">Unsubscribe</a> at any time.`;
  }
  return `You subscribed to updates from ${store}. Reply with the word "unsubscribe" and we will take you off the list.`;
}

/* ---------------- the messages the store actually sends ---------------- */

/** Licence keys, once an order is paid. This is the promise made at checkout. */
async function sendOrderKeys(orderId) {
  const order = await db.one('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order || order.payment_status !== 'paid') return { sent: false, reason: 'not-paid' };

  // the Settings -> Email switch is a real switch: turning it off stops receipts,
  // and the skip is logged so nobody wonders where the email went
  const settings = await store.settings();
  if (settings.email_order_confirmation === '0') {
    console.warn(`[mail] receipt for order ${order.order_number} suppressed by settings`);
    return { sent: false, reason: 'disabled-in-settings' };
  }

  const [items, licences] = await Promise.all([
    db.query('SELECT product_name, quantity, line_total FROM order_items WHERE order_id = ?', [orderId]),
    db.query(
      `SELECT l.license_key, l.expires_at, p.name AS product_name
       FROM licenses l LEFT JOIN products p ON p.id = l.product_id
       WHERE l.order_id = ? ORDER BY l.id`,
      [orderId]
    ),
  ]);

  const site = await publicUrl(settings);
  const name = await siteName(settings);
  const rows = items
    .map(
      (i) => `<tr><td style="padding:7px 0;font-size:13.5px">${esc(i.product_name)} &times; ${i.quantity}</td>
              <td align="right" style="padding:7px 0;font-size:13.5px">$${Number(i.line_total).toFixed(2)}</td></tr>`
    )
    .join('');

  const validity = (l) =>
    l.expires_at ? `Valid until ${new Date(l.expires_at).toISOString().slice(0, 10)}` : 'Never expires';

  const keys = licences.length
    ? `<p style="margin:20px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Your licence ${licences.length === 1 ? 'key' : 'keys'}</p>` +
      licences
        .map(
          (l) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:11px 13px;margin-bottom:8px">
            <div style="font-size:12px;color:#64748b">${esc(l.product_name || 'Licence')}</div>
            <div style="font-family:Consolas,monospace;font-size:15px;font-weight:700;color:#0f172a;letter-spacing:.06em">${esc(l.license_key)}</div>
            <div style="font-size:11.5px;color:#94a3b8">${validity(l)}</div>
          </div>`
        )
        .join('')
    : '<p style="font-size:13.5px">Your keys are being prepared and will appear in your account shortly.</p>';

  // a text part that says the same thing as the HTML, with the keys spelled out -
  // filters compare the two parts, and a reader on a plain-text client still gets
  // everything they paid for
  const lines = [
    `Thank you, ${order.customer_name || 'there'}`,
    '',
    `Payment for order ${order.order_number} is confirmed, so your licences are ready.`,
    '',
    ...items.map((i) => `  ${i.product_name} x ${i.quantity} - $${Number(i.line_total).toFixed(2)}`),
    `  Total: $${Number(order.total).toFixed(2)}`,
  ];
  if (licences.length) {
    lines.push('', licences.length === 1 ? 'Your licence key:' : 'Your licence keys:');
    for (const l of licences) {
      lines.push(`  ${l.product_name || 'Licence'}: ${l.license_key} (${validity(l)})`);
    }
  }
  if (site) lines.push('', `Open your licences: ${site}/account/licenses`);

  return send({
    to: order.customer_email,
    kind: 'order',
    subject: `Your ${name} licence keys - order ${order.order_number}`,
    text: lines.join('\n'),
    html: await layout({
      heading: `Thank you, ${esc(order.customer_name || 'there')}`,
      intro: `Payment for order <b>${esc(order.order_number)}</b> is confirmed, so your licences are ready.`,
      body: `<table role="presentation" width="100%" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-top:8px">${rows}
        <tr><td style="padding:9px 0;font-size:14px;font-weight:700">Total</td>
        <td align="right" style="padding:9px 0;font-size:14px;font-weight:700">$${Number(order.total).toFixed(2)}</td></tr></table>${keys}`,
      cta: site ? { href: `${site}/account/licenses`, label: 'Open your licences' } : null,
      footer: `You are receiving this because you placed an order with ${nameLink(name, site)}.`,
    }),
  });
}

/** Confirms a newsletter sign-up. */
async function sendSubscribeWelcome(email) {
  const site = await publicUrl();
  const name = await siteName();
  const intro = 'You will hear from us when there is a new release or a genuine deal worth your time - not otherwise.';
  const text = ['Thanks for subscribing', '', intro];
  if (site) text.push('', `Browse the catalogue: ${site}/products`);
  const link = unsubscribeUrl(email, site);
  text.push('', link ? `Unsubscribe: ${link}` : 'Reply with the word "unsubscribe" to be removed.');

  return send({
    to: email,
    kind: 'newsletter',
    subject: `You are subscribed to ${name}`,
    text: text.join('\n'),
    headers: await bulkHeaders(email, site),
    html: await layout({
      heading: 'Thanks for subscribing',
      intro,
      cta: site ? { href: `${site}/products`, label: 'Browse the catalogue' } : null,
      footer: unsubscribeFooter(email, name, site),
    }),
  });
}

/** One newsletter, written by an admin, to every active subscriber. */
async function sendNewsletter({ subject, heading, message }) {
  const subs = await broadcastRecipients();
  const site = await publicUrl();
  const name = await siteName();

  const results = { total: subs.length, sent: 0, failed: 0 };
  for (const s of subs) {
    // the unsubscribe link is per-address, so the body is built per recipient
    const text = [heading || subject, '', message];
    if (site) text.push('', `Browse the catalogue: ${site}/products`);
    const link = unsubscribeUrl(s.email, site);
    text.push('', link ? `Unsubscribe: ${link}` : 'Reply with the word "unsubscribe" to be removed.');

    const html = await layout({
      heading: heading || subject,
      intro: esc(message).replace(/\n/g, '<br />'),
      cta: site ? { href: `${site}/products`, label: 'Browse the catalogue' } : null,
      footer: unsubscribeFooter(s.email, name, site),
    });

    // one at a time: a shared inbox provider will throttle or block a burst
    const r = await send({
      to: s.email,
      subject,
      html,
      text: text.join('\n'),
      kind: 'newsletter',
      headers: await bulkHeaders(s.email, site),
    });
    if (r.sent) results.sent += 1;
    else results.failed += 1;
  }
  return results;
}

/**
 * Everyone an announcement goes to: newsletter subscribers *and* registered customers.
 *
 * An opt-out always wins. A customer who unsubscribed has a newsletter_subscribers row
 * with is_active = 0, and that row keeps them out of this list even though they still
 * hold an account - having bought something is not consent to be marketed to forever.
 * UNION also means somebody on both lists is mailed once, not twice.
 */
async function broadcastRecipients() {
  return db.query(
    `SELECT email FROM newsletter_subscribers WHERE is_active = 1
     UNION
     SELECT u.email FROM users u
       LEFT JOIN newsletter_subscribers n ON n.email = u.email
      WHERE u.status = 'active' AND (n.email IS NULL OR n.is_active = 1)`
  );
}

/** How many each source contributes, for the admin console. */
async function audience() {
  const [all, subs, users] = await Promise.all([
    broadcastRecipients(),
    db.scalar('SELECT COUNT(*) AS v FROM newsletter_subscribers WHERE is_active = 1'),
    db.scalar(
      `SELECT COUNT(*) AS v FROM users u
         LEFT JOIN newsletter_subscribers n ON n.email = u.email
        WHERE u.status = 'active' AND (n.email IS NULL OR n.is_active = 1)`
    ),
  ]);
  return { total: all.length, subscribers: Number(subs), customers: Number(users) };
}

/** How a discount is announced, matching the wording on the storefront. */
function offerText(percent, reason) {
  const pct = Number(percent) || 0;
  if (!pct) return '';
  const why = String(reason || '').trim();
  return why ? `${pct}% OFF for ${why}` : `${pct}% OFF`;
}

/**
 * Every product currently carrying its own discount, best deal first.
 *
 * Returns them all, each flagged with whether it may be announced, so the admin
 * console can list the whole set and show which ones the email will leave out.
 * Filtering happens at send time, not here.
 */
async function discountedProducts() {
  const rows = await db.query(
    `SELECT id, name, slug, price, discount_percent, discount_label, announce_discount,
            short_desc, licence_term
     FROM products
     WHERE status = 'active' AND discount_percent > 0
     ORDER BY discount_percent DESC, price DESC`
  );
  return rows.map((p) => ({
    // the id lets the admin console toggle `announce` straight from the deals list
    id: p.id,
    name: p.name,
    slug: p.slug,
    shortDesc: p.short_desc,
    label: p.discount_label || null,
    announce: Boolean(p.announce_discount),
    percent: store.productDiscount(p),
    was: Number(p.price),
    now: store.salePrice(p),
  }));
}

/**
 * The deals announcement: what is on offer right now, and by how much.
 *
 * The list is read from the catalogue rather than typed by hand, so the email cannot
 * promise a discount that is not actually loaded - the price a reader sees here is
 * the price the cart will charge them.
 */
async function sendDealsAnnouncement({ subject, message } = {}) {
  // only the ones an admin ticked for announcing - a discount can be live and quiet
  const deals = (await discountedProducts()).filter((d) => d.announce);
  if (!deals.length) return { total: 0, sent: 0, failed: 0, reason: 'no-discounts' };

  const subs = await broadcastRecipients();
  const site = await publicUrl();
  const name = await siteName();
  const best = Math.max(...deals.map((d) => d.percent));
  // when every deal belongs to the same campaign, that name is the headline;
  // a mixed bag falls back to the store name
  const labels = [...new Set(deals.map((d) => d.label).filter(Boolean))];
  const campaign = labels.length === 1 && deals.every((d) => d.label) ? labels[0] : null;
  const line = subject || (campaign ? `${campaign}: up to ${best}% off` : `Up to ${best}% off at ${name}`);
  const intro = message
    || `${deals.length === 1 ? 'One title is' : `${deals.length} titles are`} discounted right now. The price shown is the price you pay at checkout.`;

  const cards = deals
    .map((d) => {
      const title = site
        ? `<a href="${esc(site)}/products/${esc(d.slug)}" style="color:#0f172a;text-decoration:none">${esc(d.name)}</a>`
        : esc(d.name);
      return `<tr><td style="padding:11px 0;border-bottom:1px solid #e2e8f0">
        <table role="presentation" width="100%"><tr>
          <td>
            <div style="font-size:14px;font-weight:700;color:#0f172a">${title}</div>
            ${d.shortDesc ? `<div style="font-size:12px;color:#64748b;margin-top:3px">${esc(d.shortDesc)}</div>` : ''}
          </td>
          <td align="right" style="white-space:nowrap;padding-left:12px">
            <span style="background:#dcfce7;color:#15803d;border-radius:20px;padding:3px 9px;font-size:11.5px;font-weight:700">${esc(offerText(d.percent, d.label))}</span>
            <div style="margin-top:4px">
              <span style="color:#94a3b8;text-decoration:line-through;font-size:12px">$${d.was.toFixed(2)}</span>
              <span style="color:#0f172a;font-weight:700;font-size:15px;margin-left:6px">$${d.now.toFixed(2)}</span>
            </div>
          </td>
        </tr></table>
      </td></tr>`;
    })
    .join('');

  const results = { total: subs.length, sent: 0, failed: 0, deals: deals.length };
  for (const s of subs) {
    const text = [
      line,
      '',
      intro,
      '',
      ...deals.map(
        (d) => `  ${d.name} - ${offerText(d.percent, d.label)}: `
          + `was $${d.was.toFixed(2)}, now $${d.now.toFixed(2)}`
      ),
    ];
    if (site) text.push('', `See them all: ${site}/products`);
    const link = unsubscribeUrl(s.email, site);
    text.push('', link ? `Unsubscribe: ${link}` : 'Reply with the word "unsubscribe" to be removed.');

    const html = await layout({
      heading: line,
      intro: esc(intro),
      body: `<table role="presentation" width="100%" style="margin-top:6px">${cards}</table>
        <p style="margin:14px 0 0;font-size:11.5px;color:#94a3b8">A discounted title keeps its price at
        checkout - the payment-method discount is not applied on top.</p>`,
      cta: site ? { href: `${site}/products`, label: 'See all the deals' } : null,
      footer: unsubscribeFooter(s.email, name, site),
    });

    const r = await send({
      to: s.email,
      subject: line,
      html,
      text: text.join('\n'),
      kind: 'newsletter',
      headers: await bulkHeaders(s.email, site),
    });
    if (r.sent) results.sent += 1;
    else results.failed += 1;
  }
  return results;
}

module.exports = {

  send,
  verify,
  isConfigured,
  describe,
  publicUrl,
  siteName,
  unsubscribeToken,
  sendOrderKeys,
  sendSubscribeWelcome,
  sendNewsletter,
  sendDealsAnnouncement,
  discountedProducts,
  broadcastRecipients,
  audience,
  layout,
};
