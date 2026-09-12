import { Link } from 'react-router-dom';
import Icon from './Icon';
import ProductThumb from './ProductThumb';
import { money, savePercent, accentStyle, offerText } from '../utils/format';

/**
 * `hideOffer` shows a discounted product plainly - the price the cart charges, but no
 * badge and no struck-through original. It is for rows that sit alongside a dedicated
 * deals section: the offer is worth shouting once, not twice on the same screen.
 */
export default function ProductCard({ product, onAdd, revealDelay = 0, hideOffer = false }) {
  // an active discount wins over the marketing compare-at price: it is the one that
  // actually changed what this costs, so it is the one worth shouting about
  const discount = Number(product.discountPercent) || 0;
  const onSale = discount > 0 && !hideOffer;
  // a suppressed offer hides the compare-at price too, otherwise the card just shouts
  // the same saving with different numbers
  const muted = discount > 0 && hideOffer;
  const wasPrice = onSale ? product.listPrice : muted ? null : product.comparePrice;
  const save = onSale ? discount : muted ? 0 : savePercent(product.price, product.comparePrice);

  return (
    // the card is auto-tagged for reveal; revealDelay staggers a row of them
    <div className="product-card" data-reveal style={revealDelay ? { '--d': `${revealDelay}ms` } : undefined}>
      {/* the whole offer in one phrase - "50% OFF for Black Friday" */}
      {onSale ? (
        <span className="product-badge product-badge-sale">
          {offerText(discount, product.discountLabel)}
        </span>
      ) : (
        product.badge && <span className="product-badge">{product.badge}</span>
      )}

      <Link to={`/products/${product.slug}`} style={{ color: 'inherit' }}>
        <div className="product-thumb" style={product.imageUrl ? undefined : accentStyle(product.accent)}>
          <ProductThumb product={product} fill radius={10} />
        </div>
        {product.categoryName && <div className="product-cat">{product.categoryName}</div>}
        <h3>{product.name}</h3>
        {product.shortDesc && <p className="desc">{product.shortDesc}</p>}
      </Link>

      <div className="product-price">
        <span className="now">{money(product.price, false)}</span>
        {wasPrice > product.price && (
          <>
            <span className="was">{money(wasPrice, false)}</span>
            {save > 0 && (
              <span className={`save-badge ${onSale ? 'on-sale' : ''}`}>
                {onSale ? `-${save}%` : `Save ${save}%`}
              </span>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Link to={`/products/${product.slug}`} className="btn btn-outline btn-sm" style={{ flex: 1 }}>
          View Details
        </Link>
        {onAdd && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onAdd(product)}
            disabled={product.stock < 1}
            title={product.stock < 1 ? 'Out of stock' : 'Add to cart'}
            aria-label={`Add ${product.name} to cart`}
          >
            <Icon name="cart" />
          </button>
        )}
      </div>
    </div>
  );
}
