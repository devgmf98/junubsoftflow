import { useEffect } from 'react';

/**
 * Reveals content as it scrolls into view.
 *
 * The revealed state is a data attribute, never a class: adding a class rewrites an
 * element's `class`, which silently breaks anything matching it exactly.
 *
 * Two ways in: an explicit `data-reveal` attribute for hand-placed effects, and an
 * automatic pass over the app's card-shaped components so every page gets the same
 * treatment without being tagged by hand.
 *
 * The effect replays: an element that scrolls fully out of view is armed again, so it
 * animates each time it comes back rather than once per page load.
 *
 * Mounted once at the app root. A MutationObserver picks up whatever a route renders
 * next. Anything that cannot be observed is shown immediately - content must never be
 * left invisible because an observer did not run.
 */

/**
 * What rises into view on every page.
 *
 * Cards and panels, plus the smaller repeating rows that make a dense admin table feel
 * as alive as the marketing pages. Nesting is fine and intentional: a panel settles,
 * then its rows cascade inside it.
 */
const AUTO = [
  // cards
  '.product-card',
  '.pkg-card',
  '.about-value',
  '.about-step',
  '.about-principle',
  '.cat-tile',
  '.contact-channel',
  '.contact-promise',
  '.faq-item',
  '.feature-card',
  '.review-card',
  // containers
  '.panel',
  '.kpi',
  '.owned-product',
  '.deliverables',
  '.section-head',
  '.toolbar',
  '.about-stats',
  '.pkg-stats',
].join(',');

/*
 * Table rows are deliberately NOT animated.
 *
 * Revealing every row looked good on a short list, but a table is dense and the
 * effect replays on each scroll pass - so dragging through a long table meant dozens
 * of simultaneous opacity/transform transitions, and the scroll felt heavy. The panel
 * around the table still animates, so a table arrives as one surface.
 */

/** Overlays and chrome animate on their own terms, or not at all. */
const SKIP = '.toast, .toast-host, .sidebar, .drawer, .modal, .modal-back, .slider-back';

const STAGGER_MS = 70;
/** High enough that a full grid still arrives one card at a time, not in a clump. */
const MAX_STAGGER_MS = 560;

export default function useReveal() {
  useEffect(() => {
    const showAll = () => {
      document.querySelectorAll('[data-reveal]').forEach((el) => el.setAttribute('data-shown', ''));
    };

    const reduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      showAll();
      return undefined;
    }

    let everFired = false;
    // scoped to this effect run, so a remount re-observes everything
    const bound = new WeakSet();

    const io = new IntersectionObserver(
      (entries) => {
        everFired = true;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-shown', '');
          } else {
            // Fully out of view, so arm it again - the effect replays every time the
            // element is scrolled back to, rather than firing once per page load.
            entry.target.removeAttribute('data-shown');
          }
        }
      },
      // start a little before the element arrives, so it has settled by the time it is read
      { rootMargin: '0px 0px -6% 0px', threshold: [0, 0.04] }
    );

    /** Tags card-shaped elements so a page needs no markup changes of its own. */
    const autoTag = (root) => {
      const scope = root.querySelectorAll ? root : document;
      const found = [...scope.querySelectorAll(AUTO)];
      if (root.nodeType === 1 && root.matches && root.matches(AUTO)) found.unshift(root);

      for (const el of found) {
        if (el.closest(SKIP)) continue;
        if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', '');

        // A component may tag itself (ProductCard does) without setting a delay -
        // skipping those outright left whole grids arriving in one block. Only an
        // explicit --d from the page is left alone.
        if (el.style.getPropertyValue('--d')) continue;

        // stagger against the siblings it appears alongside, capped so a long
        // list does not trickle in for seconds
        const peers = el.parentElement ? [...el.parentElement.children] : [];
        const i = Math.max(0, peers.indexOf(el));
        el.style.setProperty('--d', `${Math.min(i * STAGGER_MS, MAX_STAGGER_MS)}ms`);
      }
    };

    const watch = (root) => {
      autoTag(root);
      const nodes =
        root.nodeType === 1 && root.matches && root.matches('[data-reveal]')
          ? [root, ...root.querySelectorAll('[data-reveal]')]
          : root.querySelectorAll
          ? [...root.querySelectorAll('[data-reveal]')]
          : [];
      for (const el of nodes) {
        if (bound.has(el)) continue;
        bound.add(el);
        io.observe(el);
      }
    };

    watch(document);

    const mo = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node.nodeType === 1) watch(node);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Last resort, and only if the observer never ran at all: a blanket reveal would
    // otherwise pin everything open and kill the replay.
    const failsafe = window.setTimeout(() => {
      if (!everFired) showAll();
    }, 2500);

    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);
}
