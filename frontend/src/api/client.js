/**
 * Thin fetch wrapper around the SoftFlow API.
 * Always sends the session cookie, and turns non-2xx responses into thrown Errors.
 */

const BASE = '/api';

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

export default api;
