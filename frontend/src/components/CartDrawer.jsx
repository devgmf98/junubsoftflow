import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import Icon from './Icon';
import ProductThumb from './ProductThumb';
import { money, accentStyle } from '../utils/format';

/** Slide-over cart, matching step 4 of the reference flow. */
export default function CartDrawer({ onClose }) {
  const { items, subtotal, discount, total, count, setQuantity, remove, pricing } = useCart();

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <h3>Your Cart ({count})</h3>
          <button onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="drawer-body">
          {!items.length ? (
            <div className="empty">
              <Icon name="cart" />
              <p>Your cart is empty.</p>
              <Link to="/products" className="btn btn-primary btn-sm" onClick={onClose} style={{ marginTop: 12 }}>
                Browse products
              </Link>
            </div>
          ) : (
            items.map((item) => (
              <div className="cart-line" key={item.key}>
                <span className="cart-thumb" style={item.imageUrl ? undefined : accentStyle(item.accent)}>
                  <ProductThumb product={item} fill radius={10} />
                </span>

                <div className="info">
                  <h4>{item.name}{item.packageName ? ` — ${item.packageName}` : ''}</h4>
                  <div className="m">{money(item.price)} each</div>
                  <div className="qty" style={{ marginTop: 8, width: 'fit-content' }}>
                    <button
                      onClick={() => setQuantity(item.key, item.quantity - 1)}
                      aria-label="Decrease"
                    >
                      &minus;
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      min="1"
                      onChange={(e) => setQuantity(item.key, parseInt(e.target.value, 10) || 1)}
                      aria-label={`Quantity of ${item.name}`}
                    />
                    <button
                      onClick={() => setQuantity(item.key, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      aria-label="Increase"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className="price">{money(item.lineTotal)}</div>
                  <button className="icon-btn" onClick={() => remove(item.key)} aria-label={`Remove ${item.name}`}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="drawer-foot">
            <div className="summary-row">
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            {discount > 0 && (
              <div className="summary-row">
                <span>Discount</span>
                <span className="disc">-{money(discount)}</span>
              </div>
            )}
            <div className="summary-row total">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            <Link
              to="/checkout"
              className="btn btn-primary btn-block"
              onClick={onClose}
              style={{ marginTop: 12 }}
              aria-disabled={pricing}
            >
              Proceed to Checkout
            </Link>
            <Link to="/cart" className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 6 }}>
              View full cart
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
