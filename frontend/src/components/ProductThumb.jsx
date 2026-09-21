import { useState } from 'react';
import Icon from './Icon';
import { assetUrl } from '../api/client';
import { accentStyle } from '../utils/format';

/**
 * A product's picture: the uploaded image when there is one, otherwise the
 * tinted icon that older/seeded products still use.
 *
 * An image that fails to load takes the icon too. A row can outlive its file -
 * uploads sat on an ephemeral container filesystem until a volume was attached,
 * and every deploy erased them - and a broken-image glyph tells a customer
 * nothing except that the site is broken.
 *
 * `size` is a CSS length for the square variants; `fill` stretches to the parent.
 */
export default function ProductThumb({ product = {}, size = 36, radius = 9, fill = false, className = '' }) {
  const { imageUrl, name, icon, accent } = product;
  const [failed, setFailed] = useState(false);

  const box = fill
    ? { width: '100%', height: '100%' }
    : { width: size, height: size, flex: 'none' };

  if (imageUrl && !failed) {
    return (
      <span className={`product-thumb-img ${className}`} style={{ ...box, borderRadius: radius }}>
        <img
          src={assetUrl(imageUrl)}
          alt={name ? `${name}` : ''}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`product-thumb-icon ${className}`}
      style={{ ...box, ...accentStyle(accent), borderRadius: radius }}
    >
      <Icon name={icon || 'box'} />
    </span>
  );
}
