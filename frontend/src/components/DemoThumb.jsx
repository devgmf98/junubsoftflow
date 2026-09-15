import Icon from './Icon';
import { assetUrl } from '../api/client';
import { accentStyle, platformIcon, platformAccent } from '../utils/format';

/**
 * A demo's picture.
 *
 * Its product's image where there is one - that is what someone recognises the
 * demo by. A demo need not belong to a product, and a product need not have an
 * image, so the tinted platform icon remains the fallback rather than a generic
 * placeholder.
 */
export default function DemoThumb({ demo = {}, size = 34, radius = 9, style }) {
  const box = { width: size, height: size, borderRadius: radius, flex: 'none', ...style };

  if (demo.productImage) {
    return (
      <span className="product-thumb-img" style={box}>
        <img src={assetUrl(demo.productImage)} alt={demo.productName || ''} loading="lazy" />
      </span>
    );
  }

  return (
    <span className="kpi-ic" style={{ ...accentStyle(platformAccent(demo.platform)), ...box }}>
      <Icon name={platformIcon(demo.platform)} />
    </span>
  );
}
