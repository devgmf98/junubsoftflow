import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import Icon from '../components/Icon';
import ProductThumb from '../components/ProductThumb';
import { Empty } from '../components/ui';
import { money, accentStyle } from '../utils/format';

/** Step 4 of the reference flow: the full cart page. */
export default function Cart() {
  const {
    items, subtotal, discount, discountPercent, alreadyDiscounted, discountableSubtotal,
    total, count, setQuantity, remove, clear,
  } = useCart();

  return (
    <section className="section">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link> <span>/</span> <span>Cart</span>
        </div>

        <div className="section-head">
          <div>
            <h2>Your Cart{count > 0 && ` (${count})`}</h2>
            <p>Review your items before checkout.</p>
          </div>
          {items.length > 0 && (
            <div className="right">
              <button className="btn btn-ghost btn-sm" onClick={clear}>Clear cart</button>
            </div>
          )}
        </div>

        {!items.length ? (
          <div className="panel">
            <div className="panel-body">
              <Empty
                icon="cart"
                action={<Link to="/products" className="btn btn-primary">Browse products</Link>}
              >
                Your cart is empty.
              </Empty>
            </div>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="panel">
              <div className="panel-body">
                {items.map((item) => (
                  <div className="cart-line" key={item.key}>
                    <span className="cart-thumb" style={item.imageUrl ? undefined : accentStyle(item.accent)}>
                      <ProductThumb product={item} fill radius={10} />
                    </span>

                    <div className="info">
                      <h4>
                        <Link to={`/products/${item.slug}`} style={{ color: 'inherit' }}>{item.name}</Link>
                      </h4>
                      <div className="m">
                        {money(item.price)} each
                        {item.licenceTerm && ` · ${item.licenceTerm}`}
                      </div>
                    </div>

                    <div className="qty">
                      <button onClick={() => setQuantity(item.key, item.quantity - 1)} aria-label="Decrease">
                        &minus;
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
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

                    <div className="price">{money(item.lineTotal)}</div>

                    <button className="icon-btn" onClick={() => remove(item.key)} aria-label={`Remove ${item.name}`}>
                      <Icon name="trash" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="summary">
              <h3>Order Summary</h3>
              <div className="summary-row">
                <span>Subtotal ({count} item{count === 1 ? '' : 's'})</span>
                <b>{money(subtotal)}</b>
              </div>
              {alreadyDiscounted > 0 && (
                <div className="summary-row">
                  <span>Already discounted</span>
                  <span className="cell-sub">{money(alreadyDiscounted)} of the basket</span>
                </div>
              )}
              {discount > 0 && (
                <div className="summary-row">
                  <span>
                    Discount{discountPercent ? ` (${discountPercent}%)` : ''}
                    {/* the rate applies to part of the basket, so say which part */}
                    {alreadyDiscounted > 0 && (
                      <span className="cell-sub" style={{ display: 'block' }}>
                        on {money(discountableSubtotal)} - sale items keep their own price
                      </span>
                    )}
                  </span>
                  <span className="disc">-{money(discount)}</span>
                </div>
              )}
              <div className="summary-row">
                <span>Delivery</span>
                <span style={{ color: '#059669', fontWeight: 600 }}>Instant · Free</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>

              <Link to="/checkout" className="btn btn-primary btn-block" style={{ marginTop: 14 }}>
                Proceed to Checkout
              </Link>
              <Link to="/products" className="btn btn-ghost btn-block" style={{ marginTop: 6 }}>
                Continue shopping
              </Link>

              <div style={{ marginTop: 16, display: 'grid', gap: 8, fontSize: 11.5 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="shield" style={{ width: 14 }} /> Secure payment
                </span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="bolt" style={{ width: 14 }} /> Licence key by email in minutes
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
