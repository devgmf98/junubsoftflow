import { Link } from 'react-router-dom';
import Icon from './Icon';
import ProductThumb from './ProductThumb';
import { money } from '../utils/format';

/**
 * A product in Big Deal Offers.
 *
 * Deliberately not a ProductCard. That one is a tall white tile built to sit in a grid
 * of a dozen; this is a compact dark strip built to be scanned - thumbnail beside the
 * title rather than above it, so three of them read as a banner rather than another
 * catalogue row.
 *
 * The price shown is the price the cart charges - see store.salePrice() on the server.
 */
export default function DealCard({ product, onAdd, revealDelay = 0 }) {
  const percent = Number(product.discountPercent) || 0;
  const was = Number(product.listPrice) || 0;
  const now = Number(product.price) || 0;
  const saved = was > now ? was - now : 0;

  return (
    <div
      className="deal-card"
      data-reveal
      style={revealDelay ? { '--d': `${revealDelay}ms` } : undefined}
    >
      <div className="deal-head">
        <span className="deal-thumb">
          <ProductThumb product={product} size={40} radius={10} />
        </span>

        <Link to={`/products/${product.slug}`} className="deal-title">
          {product.categoryName && <span className="deal-cat">{product.categoryName}</span>}
          <h3>{product.name}</h3>
        </Link>

        {/* the stamp, not a badge - it is the reason this card exists */}
        <span className="deal-stamp">
          <b>{percent}%</b>
          <i>OFF</i>
        </span>
      </div>

      <div className="deal-price">
        <span className="deal-now">{money(now)}</span>
        {was > now && <span className="deal-was">{money(was)}</span>}
        {/* money saved beats a percentage - it is the number people actually feel */}
        {saved > 0 && <span className="deal-saved">save {money(saved)}</span>}
      </div>

      {product.discountLabel && (
        <span className="deal-reason">
          <Icon name="tag" /> {product.discountLabel}
        </span>
      )}

      <div className="deal-actions">
        {onAdd && (
          <button
            className="btn btn-deal"
            onClick={() => onAdd(product)}
            disabled={product.stock < 1}
            title={product.stock < 1 ? 'Out of stock' : 'Add to cart'}
          >
            <Icon name="cart" /> {product.stock < 1 ? 'Out of stock' : 'Add to cart'}
          </button>
        )}
        <Link to={`/products/${product.slug}`} className="deal-link">
          Details <Icon name="arrowRight" />
        </Link>
      </div>
    </div>
  );
}
