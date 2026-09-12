import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

/**
 * Store settings, fetched once and shared.
 *
 * The site name is the obvious case: it is set in Settings -> General and has to appear
 * in the header, the sidebar, the footer, the browser tab and every email. Before this
 * it was typed into a dozen files, so renaming the store meant a code change.
 *
 * The last known values are kept in localStorage and used for the very first paint.
 * Without that the header renders the built-in default, then visibly swaps to the real
 * name a moment later when the request lands - the store appears to rename itself on
 * every page load. The network fetch still runs and still wins; the cache only decides
 * what is on screen for the few hundred milliseconds before it arrives.
 */
const SettingsContext = createContext(null);

const CACHE_KEY = 'softflow.settings';

const FALLBACK = {
  site_name: 'SoftFlow',
  site_tagline: 'Software for a smarter tomorrow',
};

/** Reading storage can throw outright in private mode, so it is always guarded. */
function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(settings) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* a browser that refuses storage just pays the one-frame swap */
  }
}

/** Blank values in the database must not wipe the name out. */
function merge(settings) {
  const clean = Object.fromEntries(
    Object.entries(settings || {}).filter(([, v]) => String(v ?? '').trim() !== '')
  );
  return { ...FALLBACK, ...clean };
}

export function SettingsProvider({ children }) {
  // lazy initialisers: these run before the first render, so the correct name is on
  // screen from the very first frame for anyone who has been here before
  const [cached] = useState(() => readCache());
  const [settings, setSettings] = useState(() => merge(cached));
  const [loaded, setLoaded] = useState(false);

  const apply = (incoming) => {
    const next = merge(incoming);
    setSettings(next);
    writeCache(next);
    return next;
  };

  useEffect(() => {
    let alive = true;
    api
      .get('/shop/settings')
      .then((d) => {
        if (alive) apply(d.settings);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loaded,
      siteName: settings.site_name || FALLBACK.site_name,
      tagline: settings.site_tagline || FALLBACK.site_tagline,
      /**
       * True while the name on screen is only a guess - a first-ever visit, before the
       * settings arrive. Callers hold the wordmark back for that moment instead of
       * printing the built-in default and correcting it a frame later.
       */
      guessing: !cached && !loaded,
      /**
       * Re-reads the settings and refreshes the cache. Called right after an admin
       * saves, so the rename shows up in their own header immediately rather than on
       * their next visit.
       */
      reload: () => api.get('/shop/settings').then((d) => apply(d.settings)).catch(() => {}),
    }),
    [settings, loaded, cached]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

export default SettingsContext;
