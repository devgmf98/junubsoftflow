/**
 * Thin fetch wrapper around the SoftFlow API.
 * Always sends the session cookie, and turns non-2xx responses into thrown Errors.
 */

/**
 * Where the API lives.
 *
 * In development this stays relative so the Vite proxy forwards /api to port 4000 and
 * the session cookie is first-party. In production the front end is on Netlify and the
 * API is on Railway - two different origins - so VITE_API_URL carries the absolute
 * address. A relative /api there would hit Netlify's CDN and 404.
 */
const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, { method = 'GET', body, isForm = false, ...rest } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: isForm ? {} : { 'Content-Type': 'application/json' },
    ...rest,
  };

  if (body !== undefined) {
    options.body = isForm ? body : JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, options);
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res;
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData, method = 'POST') =>
    request(path, { method, body: formData, isForm: true }),
};

/** Absolute URL for a download endpoint (used by <a href> and window.open). */
export const downloadUrl = (path) => `${BASE}${path}`;

/**
 * Resolves an asset path the API handed us, such as a product image.
 *
 * Those come back server-relative ("/api/shop/review-images/x.svg"). Same-origin that
 * is already correct, but with the front end on Netlify and the API on Railway it would
 * resolve against the CDN and 404, so the /api prefix is swapped for the real base.
 * Absolute URLs and data: URIs are returned untouched.
 */
export function assetUrl(path) {
  if (!path) return path;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return path.startsWith('/api') ? `${BASE}${path.slice(4)}` : path;
}

export default api;
