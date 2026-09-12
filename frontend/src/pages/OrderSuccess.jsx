import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Icon from '../components/Icon';
import { Loading, Alert } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { money, label, statusClass, date } from '../utils/format';

/** Step 6 of the reference flow: payment successful + instant access. */
export default function OrderSuccess() {
  const { number } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    api.get(`/shop/orders/${number}`).then(setData).catch((e) => setError(e.message));
  }, [number]);

  const copyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      /* clipboard can be blocked - the key is visible on screen either way */
    }
  };

  if (error) {
    return (
      <div className="container section">
        <Alert type="error">{error}</Alert>
        <Link to="/products" className="btn btn-outline">Back to products</Link>
      </div>
    );
  }
  if (!data) return <Loading variant="panel" />;

  const { order, items, licenses } = data;
  const isPaid = order.paymentStatus === 'paid';

  return (
    <section className="section">
      <div className="container">
        <div className="success-wrap">
          <div className="success-check" style={!isPaid ? { background: '#fef3c7' } : undefined}>
            <Icon name={isPaid ? 'check' : 'clock'} style={!isPaid ? { color: '#b45309' } : undefined} />
          </div>

          <h1>{isPaid ? 'Payment Successful!' : 'Order Received'}</h1>
          <p>
            {isPaid
              ? 'Your order has been placed successfully.'
              : 'We are waiting for your bank transfer to clear. Your keys will be emailed as soon as it does.'}
          </p>

          <div className="receipt">
            <div className="receipt-head">
              <div>
                <b style={{ color: 'var(--ink)', fontSize: 14 }}>Order #{order.orderNumber}</b>
                <div className="cell-sub">{date(order.createdAt)}</div>
              </div>
              <span className={`badge ${statusClass(order.status)}`}>{label(order.status)}</span>
            </div>

            {items.map((item, i) => (
              <div className="receipt-row" key={i}>
                <span>
                  {item.productName}
                  {item.quantity > 1 && <span className="cell-sub"> × {item.quantity}</span>}
                </span>
                <b style={{ color: 'var(--ink)' }}>{money(item.lineTotal)}</b>
              </div>
            ))}

            <div style={{ borderTop: '1px solid var(--line-2)', marginTop: 8, paddingTop: 8 }}>
              <div className="receipt-row">
                <span>Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="receipt-row">
                  <span>Discount</span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>-{money(order.discount)}</span>
                </div>
              )}
              <div className="receipt-row">
                <span>Payment method</span>
                <span>{label(order.paymentMethod)}</span>
              </div>
            </div>

            <div className="receipt-total">
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
          </div>

          {/* ---------- step 8: licence keys / instant access ---------- */}
          {licenses.length > 0 && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <div className="panel-head">
                <h3>Your software is ready</h3>
                <div className="right cell-sub">{licenses.length} licence key{licenses.length === 1 ? '' : 's'}</div>
              </div>
              <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
                {licenses.map((l) => (
                  <div key={l.key}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>
                      {l.productName}
                    </div>
                    <div className="license-key">
                      <span>{l.key}</span>
                      <button onClick={() => copyKey(l.key)}>
                        {copied === l.key ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ))}
                <p className="field-hint" style={{ marginTop: 0 }}>
                  These keys were also emailed to {order.customerEmail}.
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {user ? (
              <>
                <Link to="/account/downloads" className="btn btn-primary">
                  <Icon name="download" /> Go to Downloads
                </Link>
                <Link to={`/account/orders/${order.orderNumber}`} className="btn btn-outline">
                  View order details
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary">Create an account</Link>
                <Link to="/products" className="btn btn-outline">Continue shopping</Link>
              </>
            )}
          </div>

          <p style={{ marginTop: 18, fontSize: 12 }}>
            Need a hand? <Link to="/contact">Contact support</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
