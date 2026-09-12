import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api from '../api/client';

const CartContext = createContext(null);
const STORAGE_KEY = 'softflow.cart';
const MAX_QTY = 20;

/**
 * A cart line is one of:
 *   { productId }                              a plain product
 *   { productId, packageId, licenseType }      a tiered package
 *   { addonId, licenseType }                   a premium add-on
 *
 * Lines live in localStorage; the server re-prices every one of them, so nothing
 * here is trusted for money.
 */
function lineKey(line) {
  if (line.addonId) return `addon-${line.addonId}-${line.licenseType || 'regular'}`;
  if (line.packageId) return `pkg-${line.packageId}`;
  return `product-${line.productId}`;
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((l) => ({
        productId: Number(l.productId) || null,
        packageId: Number(l.packageId) || null,
        addonId: Number(l.addonId) || null,
        licenseType: l.licenseType || null,
        quantity: Math.max(1, Math.min(MAX_QTY, Number(l.quantity) || 1)),
      }))
      .filter((l) => l.productId || l.addonId);
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState(readStored);
  const [priced, setPriced] = useState({ items: [], subtotal: 0, discount: 0, total: 0, count: 0 });
  const [pricing, setPricing] = useState(false);
  // which payment method the customer is on - it decides the discount rate
  const [paymentMethod, setPaymentMethod] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* private mode - the cart just will not persist */
    }
  }, [lines]);

  useEffect(() => {
    if (!lines.length) {
      setPriced({ items: [], subtotal: 0, discount: 0, total: 0, count: 0 });
      return;
    }

    const id = ++requestId.current;
    setPricing(true);

    api
      .post('/shop/cart/price', { items: lines, paymentMethod })
      .then(({ cart }) => {
        if (id !== requestId.current) return;
        setPriced(cart);

        // drop anything the server could not resolve any more
        if (cart.removed?.length) {
          const gone = new Set(
            cart.removed.map((r) => lineKey({ ...r, licenseType: r.licenseType || 'regular' }))
          );
          setLines((prev) => prev.filter((l) => !gone.has(lineKey(l))));
        }
      })
      .catch(() => {
        if (id === requestId.current) setPriced({ items: [], subtotal: 0, discount: 0, total: 0, count: 0 });
      })
      .finally(() => {
        if (id === requestId.current) setPricing(false);
      });
  }, [lines, paymentMethod]);

  /** add({ productId, packageId, addonId, licenseType }, qty) */
  const add = useCallback((target, quantity = 1) => {
    const line = {
      productId: Number(target.productId) || null,
      packageId: Number(target.packageId) || null,
      addonId: Number(target.addonId) || null,
      licenseType: target.licenseType || null,
      quantity: Math.min(MAX_QTY, Math.max(1, quantity)),
    };
    const key = lineKey(line);

    setLines((prev) => {
      const existing = prev.find((l) => lineKey(l) === key);
      if (existing) {
        return prev.map((l) =>
          lineKey(l) === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l
        );
      }
      return [...prev, line];
    });
  }, []);

  const setQuantity = useCallback((key, quantity) => {
    const qty = Number(quantity);
    setLines((prev) =>
      qty < 1
        ? prev.filter((l) => lineKey(l) !== key)
        : prev.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l))
    );
  }, []);

  const remove = useCallback((key) => {
    setLines((prev) => prev.filter((l) => lineKey(l) !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  const value = {
    lines,
    items: priced.items,
    subtotal: priced.subtotal,
    discount: priced.discount,
    discountPercent: priced.discountPercent || 0,
    // a product with its own discount is excluded from the checkout discount,
    // so the summary needs both numbers to explain the figure it shows
    alreadyDiscounted: priced.alreadyDiscounted || 0,
    discountableSubtotal: priced.discountableSubtotal ?? priced.subtotal ?? 0,
    discountRates: priced.discountRates || null,
    paymentMethod,
    setPaymentMethod,
    total: priced.total,
    count,
    pricing,
    add,
    setQuantity,
    remove,
    clear,
    lineKey,
    MAX_QTY,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside a CartProvider');
  return ctx;
}
