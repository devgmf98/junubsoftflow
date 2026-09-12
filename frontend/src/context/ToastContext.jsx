import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';

const ToastContext = createContext(null);

/** How long each kind stays up. Errors linger - people need time to read them. */
const LIFETIME = { success: 3500, error: 6500, info: 4500 };
const ICON = { success: 'check', error: 'alert', info: 'info' };
const MAX_VISIBLE = 4;

let nextId = 1;

/**
 * App-wide toasts for the outcome of an action: saved, deleted, uploaded, failed.
 *
 * Toasts are for things the user just did. A page that fails to load still shows an
 * inline Alert, because a message that fades away is no way to explain an empty page.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback(
    (id, ms) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss]
  );

  const push = useCallback(
    (type, message) => {
      const text = typeof message === 'string' ? message.trim() : String(message || '').trim();
      if (!text) return null;

      const id = nextId++;
      setToasts((list) => [...list, { id, type, text }].slice(-MAX_VISIBLE));
      arm(id, LIFETIME[type] ?? LIFETIME.info);
      return id;
    },
    [arm]
  );

  const api = useMemo(
    () => ({
      ok: (message) => push('success', message),
      fail: (message) => push('error', message),
      info: (message) => push('info', message),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div className="toast-host" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
            // hovering holds the toast open so a long message can actually be read
            onMouseEnter={() => {
              const timer = timers.current.get(t.id);
              if (timer) clearTimeout(timer);
            }}
            onMouseLeave={() => arm(t.id, 1500)}
          >
            <span className="toast-ic"><Icon name={ICON[t.type] || 'info'} /></span>
            <span className="toast-text">{t.text}</span>
            <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** toast.ok('Saved.') / toast.fail(err.message) / toast.info('...') */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
