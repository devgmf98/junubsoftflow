import { useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';

const ORIGIN = 'https://junubsoftflow.com';

/** Sets or creates a meta/link tag, and reports whether it made a new one. */
function setTag(selector, create, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Per-route title, description and canonical.
 *
 * Facebook and Twitter read the static tags in index.html and never run this - the
 * point here is Google, which does render the app, plus the browser tab and anything
 * the user bookmarks or shares by copying the address.
 */
export default function usePageMeta({ title, description, path } = {}) {
  // the tab suffix follows Settings -> General, so renaming the store renames every tab
  const { siteName } = useSettings();

  useEffect(() => {
    // no title means the page IS the store - the home page, for one
    document.title = title ? `${title} | ${siteName}` : siteName;

    if (description) {
      setTag(
        'meta[name="description"]',
        () => Object.assign(document.createElement('meta'), { name: 'description' }),
        'content',
        description
      );
      // keep the share cards in step for anything that re-reads them
      setTag(
        'meta[property="og:description"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:description');
          return m;
        },
        'content',
        description
      );
    }

    {
      setTag(
        'meta[property="og:title"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:title');
          return m;
        },
        'content',
        title ? `${title} | ${siteName}` : siteName
      );
    }

    const url = ORIGIN + (path ?? window.location.pathname);
    setTag(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
      'href',
      url
    );
    setTag(
      'meta[property="og:url"]',
      () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:url');
        return m;
      },
      'content',
      url
    );
  }, [title, description, path, siteName]);
}
