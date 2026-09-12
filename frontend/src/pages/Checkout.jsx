import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import ProductThumb from '../components/ProductThumb';
import { Alert } from '../components/ui';
import { money, accentStyle, label, PAYMENT_METHODS, DEFERRED_METHODS } from '../utils/format';

const CARD_MARKS = [
  ['VISA', '#1a1f71'],
  ['MC', '#eb001b'],
  ['AMEX', '#006fcf'],
];

/** Step 5 of the reference flow: checkout with payment method + order summary. */
export default function Checkout() {
  const toast = useToast();
  const {
    items, subtotal, discount, discountPercent, alreadyDiscounted, discountableSubtotal, total, count, clear,
    discountRates, setPaymentMethod,
  } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState({});
  const [method, setMethod] = useState('card');

  // the discount depends on the method, so the cart re-prices whenever it changes
  useEffect(() => {
    setPaymentMethod(method);
  }, [method, setPaymentMethod]);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/shop/settings').then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  // prefill from the signed-in account
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        name: f.name || user.name || '',
        email: f.email || user.email || '',
        phone: f.phone || user.phone || '',
      }));
    }
  }, [user]);

  // an empty cart has nothing to check out
  useEffect(() => {
    if (!items.length && !submitting) {
      const t = window.setTimeout(() => navigate('/products'), 1200);
      return () => window.clearTimeout(t);
    }
  }, [items.length, submitting, navigate]);

  const enabledMethods = PAYMENT_METHODS.filter((m) => settings[m.settingKey] !== '0');

  // if an admin turns off the method that is currently selected, fall back to the first one left
  useEffect(() => {
    if (enabledMethods.length && !enabledMethods.some((m) => m.value === method)) {
      setMethod(enabledMethods[0].value);
    }
  }, [enabledMethods, method]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { orderNumber } = await api.post('/shop/checkout', {
        items: items.map((i) => ({
          productId: i.productId,
          packageId: i.packageId,
          addonId: i.addonId,
          licenseType: i.licenseType,
          quantity: i.quantity,
        })),
        name: form.name,
        email: form.email,
        phone: form.phone,
        paymentMethod: method,
      });
      clear();
      toast.ok(`Order ${orderNumber} placed.`);
      navigate(`/order/${orderNumber}`);
    } catch (err) {
      // stays inline too - a payment failure should not scroll away with the toast
      setError(err.message);
      toast.fail(err.message);
      setSubmitting(false);
    }
  };

  if (!items.length) {
    return (
      <section className="section">
        <div className="container">
          <Alert type="info">Your cart is empty - taking you back to the products.</Alert>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link> <span>/</span>
          <Link to="/cart">Cart</Link> <span>/</span>
          <span>Checkout</span>
        </div>

        <div className="section-head">
          <div>
            <h2>Checkout</h2>
            <p>Securely pay using your preferred method.</p>
          </div>
        </div>

        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <form onSubmit={submit}>
          <div className="checkout-layout">
            <div>
              {/* ---------- contact details ---------- */}
              <div className="panel">
                <div className="panel-head"><h3>Your details</h3></div>
                <div className="panel-body">
                  {!user && (
                    <Alert type="info">
                      Checking out as a guest. <Link to="/login">Sign in</Link> to keep your licences in one place.
                    </Alert>
                  )}
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="co-name">Full name</label>
                      <input id="co-name" value={form.name} onChange={set('name')} required placeholder="Jane Doe" />
                    </div>
                    <div className="field">
                      <label htmlFor="co-email">Email</label>
                      <input
                        id="co-email"
                        type="email"
                        value={form.email}
                        onChange={set('email')}
                        required
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="co-phone">Phone <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                    <input id="co-phone" value={form.phone} onChange={set('phone')} placeholder="+211 920 000 000" />
                  </div>
                  <p className="field-hint" style={{ marginTop: 0 }}>
                    Licence keys are emailed to this address, so double-check it.
                  </p>
                </div>
              </div>

              {/* ---------- payment method ---------- */}
              <div className="panel">
                <div className="panel-head"><h3>Payment Method</h3></div>
                <div className="panel-body">
                  <div className="pay-options">
                    {enabledMethods.map((m) => (
                      <label key={m.value} className={`pay-option ${method === m.value ? 'on' : ''}`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m.value}
                          checked={method === m.value}
                          onChange={() => setMethod(m.value)}
                        />
                        <span>
                          <span className="lbl">
                            {m.label}
                            {discountRates?.[m.value] > 0 && (
                              <span className="pay-save">save {discountRates[m.value]}%</span>
                            )}
                          </span>
                          <span className="hint" style={{ display: 'block' }}>{m.hint}</span>
                        </span>
                        {m.value === 'card' && (
                          <span className="card-marks">
                            {CARD_MARKS.map(([text, bg]) => (
                              <span className="card-mark" key={text} style={{ background: bg }}>{text}</span>
                            ))}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>

                  {DEFERRED_METHODS.includes(method) && (
                    <Alert type="info">
                      {method === 'cash'
                        ? 'Cash orders stay pending until payment is collected. Bring your order number to our office and we will release your keys straight away.'
                        : 'Bank transfer orders stay pending until the funds clear. We will email your keys as soon as payment is confirmed.'}
                    </Alert>
                  )}
                </div>
              </div>
            </div>

            {/* ---------- order summary ---------- */}
            <div className="summary">
              <h3>Order Summary</h3>

              {items.map((item) => (
                <div
                  key={item.key}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0' }}
                >
                  <ProductThumb product={item} size={34} radius={9} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', display: 'block' }}>
                      {item.name}
                      {item.packageName ? ` — ${item.packageName}` : ''}
                    </span>
                    <span className="cell-sub">
                      Qty {item.quantity}
                      {item.licenseType ? ` · ${label(item.licenseType)} licence` : ''}
                      {item.licenseCount > 1 ? ` · ${item.licenseCount} keys` : ''}
                    </span>
                  </span>
                  <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{money(item.lineTotal)}</b>
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--line-2)', marginTop: 10, paddingTop: 8 }}>
                <div className="summary-row">
                  <span>Subtotal</span>
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
                <div className="summary-row total">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={submitting} style={{ marginTop: 14 }}>
                {submitting
                  ? 'Processing...'
                  : `${DEFERRED_METHODS.includes(method) ? 'Place Order' : 'Pay Now'} · ${money(total)}`}
              </button>

              <p className="field-hint" style={{ textAlign: 'center', marginTop: 10 }}>
                <Icon name="lock" style={{ width: 11, display: 'inline', verticalAlign: -1 }} /> Payments are encrypted
                end to end.
              </p>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
