import { useState } from 'react';
import Icon from './Icon';
import logo from '../assests/jsf-logo-mark.png';

/**
 * The store logo.
 *
 * `jsf-logo-mark.png` is the supplied artwork with its white background keyed out and
 * the margin trimmed, so the mark sits correctly on both the white storefront bar and
 * the navy dashboard sidebar. The original untouched file is beside it as
 * `jsf-logo.png`.
 *
 * Imported rather than referenced from /public so Vite fingerprints and bundles it;
 * the icon fallback only shows if the image somehow fails to load at runtime.
 */
export default function BrandMark({ className = '', name = 'SoftFlow' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`brand-mark ${className}`}>
        <Icon name="bolt" />
      </span>
    );
  }

  return (
    <span className={`brand-mark brand-mark-img ${className}`}>
      <img src={logo} alt={name} onError={() => setFailed(true)} />
    </span>
  );
}
