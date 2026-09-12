'use strict';

/**
 * Captures a real response from every readable endpoint into api-samples.json.
 *
 * The samples in API-DOCS.md are meant to match what the API actually returns, so
 * they are recorded rather than written by hand. Run it whenever a response shape
 * changes:
 *
 *   node backend/tools/capture-api.js
 *
 * Read-only: it performs no DELETEs and no writes that change stored data.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const BASE = process.env.CAPTURE_BASE || `http://localhost:${process.env.PORT || 4000}/api`;
const OUT = path.join(__dirname, '..', '..', 'api-samples.json');

const ACCOUNTS = {
  admin: { email: 'admin@softflow.com', password: 'admin123' },
  user: { email: 'john@example.com', password: 'user123' },
};

const jars = { guest: '', user: '', admin: '' };

async function call(who, method, url, body) {
  const headers = {};
  if (jars[who]) headers.cookie = jars[who];
  if (body) headers['content-type'] = 'application/json';

  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (cookies.length) jars[who] = cookies.map((c) => c.split(';')[0]).join('; ');

  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json')
    ? await res.json().catch(() => null)
    : `<${type.split(';')[0] || 'binary'}, ${res.headers.get('content-length') || 'unknown'} bytes>`;

  return { status: res.status, data };
}

const samples = {};

async function grab(who, method, url, body, note) {
  const r = await call(who, method, url, body);
  // the same endpoint is sampled more than once (success, then each failure), so
  // keep the key unique or the last call silently overwrites the earlier ones
  let key = `${method} ${url}`;
  if (samples[key]) key = `${key} [${r.status}${note ? ` ${note}` : ''}]`;
  samples[key] = {
    as: who,
    status: r.status,
    ...(note ? { note } : {}),
    ...(body ? { request: body } : {}),
    response: r.data,
  };
  const size = JSON.stringify(r.data || '').length;
  console.log(`  ${String(r.status).padEnd(4)} ${method.padEnd(4)} ${url.padEnd(48)} ${who.padEnd(6)} ${size}b`);
}

async function main() {
  console.log(`> capturing from ${BASE}\n`);

  console.log('auth');
  await grab('guest', 'GET', '/auth/me', null, 'signed out');
  await grab('user', 'POST', '/auth/login', ACCOUNTS.user);
  await grab('admin', 'POST', '/auth/login', ACCOUNTS.admin);
  await grab('user', 'GET', '/auth/me', null, 'signed in');

  console.log('\nshop (public)');
  for (const url of [
    '/shop/settings',
    '/shop/categories',
    '/shop/home',
    '/shop/products?page=1',
    '/shop/products?search=money&sort=price-asc',
    '/shop/products/moneypay',
    '/shop/products/microsoft-office-365',
    '/shop/demos',
    '/shop/demos?product=moneypay',
  ]) await grab('guest', 'GET', url);

  await grab('guest', 'POST', '/shop/cart/price', {
    items: [
      { productId: 1, quantity: 2 },
      { productId: 12, packageId: 3, licenseType: 'regular', quantity: 1 },
      { addonId: 1, licenseType: 'extended', quantity: 1 },
    ],
  }, 'server re-prices every line; the client sends IDs only');

  console.log('\naccount (customer)');
  for (const url of [
    '/account/summary',
    '/account/orders?page=1',
    '/account/licenses',
    '/account/downloads',
    '/account/support',
  ]) await grab('user', 'GET', url);

  const orders = samples['GET /account/orders?page=1']?.response?.orders;
  if (orders && orders[0]) await grab('user', 'GET', `/account/orders/${orders[0].orderNumber}`);

  console.log('\nadmin');
  for (const url of [
    '/admin/dashboard',
    '/admin/products?page=1',
    '/admin/products/12',
    '/admin/products/12/files',
    '/admin/products/12/packages',
    '/admin/packages/1/files',
    '/admin/addons/1/files',
    '/admin/orders?page=1',
    '/admin/customers?page=1',
    '/admin/categories',
    '/admin/reports?range=30',
    '/admin/settings',
    '/admin/roles',
    '/admin/demos',
    '/admin/messages?page=1',
    '/admin/users',
    '/admin/users?role=admin',
    '/admin/email',
  ]) await grab('admin', 'GET', url);

  const adminOrders = samples['GET /admin/orders?page=1']?.response?.orders;
  if (adminOrders && adminOrders[0]) await grab('admin', 'GET', `/admin/orders/${adminOrders[0].id}`);

  console.log('\nbasic auth (Postman-style, no cookie)');
  {
    const creds = Buffer.from('admin@softflow.com:admin123').toString('base64');
    const res = await fetch(`${BASE}/admin/dashboard`, { headers: { authorization: `Basic ${creds}` } });
    samples['GET /admin/dashboard (Basic auth)'] = {
      as: 'basic-auth',
      status: res.status,
      note: 'Authorization: Basic base64(admin@softflow.com:admin123) - no session cookie sent',
      response: await res.json().catch(() => null),
    };
    console.log(`  ${String(res.status).padEnd(4)} GET  /admin/dashboard (Basic auth)`);
  }

  console.log('\nerrors');
  await grab('guest', 'GET', '/account/summary', null, 'not signed in');
  await grab('user', 'GET', '/admin/dashboard', null, 'signed in, wrong role');
  await grab('guest', 'GET', '/shop/products/does-not-exist', null, 'unknown slug');
  await grab('guest', 'POST', '/auth/login', { email: 'admin@softflow.com', password: 'wrong' }, 'bad credentials');
  await grab('guest', 'POST', '/shop/contact', { name: '', email: 'not-an-email', message: '' }, 'validation');
  await grab('user', 'POST', '/admin/tickets/1/reply', { message: 'x' }, 'customer cannot reply to tickets');
  await grab('admin', 'POST', '/admin/users', {
    name: 'Weak Admin', email: 'weak-admin@softflow.com', password: 'abc123', role: 'admin',
  }, 'admin passwords need 8+ characters');
  await grab('admin', 'POST', '/admin/users', {
    name: 'Duplicate', email: 'admin@softflow.com', password: 'abcd1234', role: 'admin',
  }, 'email already taken');

  const payload = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    accounts: {
      admin: 'admin@softflow.com / admin123',
      customer: 'john@example.com / user123',
    },
    note: 'Real responses captured from a running API. Regenerate with: node backend/tools/capture-api.js',
    endpoints: samples,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`\n> wrote ${Object.keys(samples).length} samples to ${OUT} (${kb} KB)`);
}

main().catch((err) => {
  console.error('capture failed:', err.message);
  console.error('is the API running?  cd backend && npm start');
  process.exit(1);
});
