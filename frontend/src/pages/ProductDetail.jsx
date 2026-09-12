import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useOutletContext } from 'react-router-dom';
import api from '../api/client';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';
import ProductCard from '../components/ProductCard';
import { Loading, Alert, Stars, Empty } from '../components/ui';
import ImageSlider, { ImageStrip } from '../components/ImageSlider';
import PricingSection from '../components/PricingSection';
import { useCart } from '../context/CartContext';
import { money, savePercent, accentStyle, offerText, date, num, fileSize, platformLabel } from '../utils/format';

/* how each deliverable kind is presented */
const KIND_LABEL = { source: 'Source code', apk: 'Android build', installer: 'Installer', document: 'Documentation' };
const KIND_ICON = { source: 'code', apk: 'android', installer: 'download', document: 'file' };
const KIND_ACCENT = { source: 'ic-purple', apk: 'ic-green', installer: 'ic-blue', document: 'ic-orange' };

const LICENSE_LABEL = { regular: 'Regular License', extended: 'Extended License', agency: 'Agency License' };

/** Step 3 of the reference flow: product details, features and reviews. */
export default function ProductDetail() {
  const toast = useToast();
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState('description');
  const [previewAt, setPreviewAt] = useState(null);
  const [packageId, setPackageId] = useState(null);
  const { add } = useCart();
  const navigate = useNavigate();
  const { openCart } = useOutletContext() || {};

  useEffect(() => {
    setData(null);
    setQty(1);
    setTab('description');
    setPackageId(null);
    api.get(`/shop/products/${slug}`).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <div className="container section">
        <Alert type="error">{error}</Alert>
        <Link to="/products" className="btn btn-outline">Back to products</Link>
      </div>
    );
  }
  if (!data) return <Loading variant="detail" />;

  const { product, features, reviews, related, demos } = data;
  const pricing = data.pricing || { licenseTypes: [], packages: [] };
  const hasPackages = product.pricingMode === 'packages' && pricing.packages.length > 0;
  // Default to the entry package (first in sort order), not the "most popular" one -
  // the cheapest tier is where a buyer should start, and they can trade up from there.
  const selectedPackage = hasPackages
    ? pricing.packages.find((x) => x.id === packageId) || pricing.packages[0]
    : null;
  const previewImages = data.previewImages || [];
  const allDeliverables = data.deliverables || [];
  // Files with no package go to every buyer; the rest ship with one tier only, so the
  // list follows whichever package is selected above.
  const deliverables = allDeliverables.filter(
    (d) => !d.packageId || d.packageId === selectedPackage?.id
  );
  const otherPackageFiles = allDeliverables.filter(
    (d) => d.packageId && d.packageId !== selectedPackage?.id
  ).length;
  const discount = Number(product.discountPercent) || 0;
  const wasPrice = discount ? product.listPrice : product.comparePrice;
  const save = discount || savePercent(product.price, product.comparePrice);
  const inStock = product.stock > 0;

  const addToCart = () => {
    add({ productId: product.id }, qty);
    toast.ok(`${qty} × ${product.name} added to your cart.`);
  };

  const buyNow = () => {
    add({ productId: product.id }, qty);
    navigate('/checkout');
  };

  const addPackage = (pkg) => {
    add({ productId: product.id, packageId: pkg.id, licenseType: pkg.licenseType }, 1);
    toast.ok(`${product.name} — ${pkg.name} added to your cart.`);
  };

  /** Buying a tier or an add-on goes straight to checkout, as on the reference site. */
  const buyPackage = (pkg) => {
    add({ productId: product.id, packageId: pkg.id, licenseType: pkg.licenseType }, 1);
    navigate('/checkout');
  };

  const buyAddon = (addon, licenseType) => {
    add({ addonId: addon.id, licenseType }, 1);
    navigate('/checkout');
  };

  return (
    <section className="section">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link> <span>/</span>
          <Link to="/products">Products</Link> <span>/</span>
          {product.categorySlug && (
            <>
              <Link to={`/products?category=${product.categorySlug}`}>{product.categoryName}</Link> <span>/</span>
            </>
          )}
          <span>{product.name}</span>
        </div>

        <div className="pdp">
          <div>
            <div className="pdp-media">
              {previewImages.length ? (
                <button
                  type="button"
                  className="pdp-preview-shot"
                  onClick={() => setPreviewAt(0)}
                  aria-label="Open the preview slider"
                >
                  <img src={previewImages[0].url} alt={previewImages[0].caption || `${product.name} preview`} />
                  <span className="pdp-preview-hint">
                    <Icon name="eye" /> Preview
                  </span>
                </button>
              ) : product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  style={{ maxHeight: 300, borderRadius: 10, objectFit: 'contain' }}
                />
              ) : (
                <span className="ic" style={accentStyle(product.accent)}>
                  <Icon name={product.icon} />
                </span>
              )}
            </div>

            {previewImages.length > 0 && (
              <>
                <div className="pdp-thumbs">
                  {previewImages.map((img, i) => (
                    <button
                      key={img.id}
                      className="pdp-thumb"
                      onClick={() => setPreviewAt(i)}
                      aria-label={`Preview image ${i + 1}`}
                    >
                      <img src={img.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
                <button className="btn btn-outline btn-block" onClick={() => setPreviewAt(0)} style={{ marginTop: 10 }}>
                  <Icon name="eye" /> Preview {previewImages.length} screenshot
                  {previewImages.length === 1 ? '' : 's'}
                </button>
              </>
            )}
          </div>

          <div>
            <h1>{product.name}</h1>
            <p className="sub">{product.shortDesc}</p>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Stars rating={product.rating} count={product.reviewCount} />
              {product.vendor && <span className="cell-sub">by {product.vendor}</span>}
            </div>

            {hasPackages ? (
              <div className="pdp-picker">
                <label htmlFor="pkg-select">Selected package</label>

                <div className="pkg-select">
                  <select
                    id="pkg-select"
                    value={selectedPackage?.id || ''}
                    onChange={(e) => setPackageId(Number(e.target.value))}
                  >
                    {pricing.licenseTypes.map((t) => (
                      <optgroup key={t} label={LICENSE_LABEL[t] || t}>
                        {pricing.packages
                          .filter((x) => x.licenseType === t)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} — {money(x.price, false)}
                              {x.savePercent ? ` (save ${x.savePercent}%)` : ''}
                              {x.licenseCount > 1 ? ` · ${x.licenseCount} licences` : ''}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <Icon name="chevronDown" />
                </div>

                {selectedPackage && (
                  <>
                    <div className="pdp-price">
                      <span className="now">{money(selectedPackage.price)}</span>
                      {selectedPackage.comparePrice > selectedPackage.price && (
                        <>
                          <span className="was">{money(selectedPackage.comparePrice)}</span>
                          <span className="save-badge">Save {selectedPackage.savePercent}%</span>
                        </>
                      )}
                    </div>

                    <div className="cell-sub" style={{ marginTop: -8, marginBottom: 14 }}>
                      {LICENSE_LABEL[selectedPackage.licenseType]}
                      {selectedPackage.licenseCount > 1 &&
                        ` · ${selectedPackage.licenseCount} licences (${money(selectedPackage.perLicense, false)} each)`}
                    </div>

                    <ul className="pdp-feats">
                      {[...selectedPackage.included, ...selectedPackage.addons].slice(0, 6).map((f, i) => (
                        <li key={i}>
                          <Icon name="check" />
                          <span>{f.label}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="pdp-buy">
                      <button
                        className="btn btn-primary btn-lg"
                        onClick={() => addPackage(selectedPackage)}
                      >
                        <Icon name="cart" /> Add to Cart
                      </button>
                      <button className="btn btn-outline btn-lg" onClick={() => buyPackage(selectedPackage)}>
                        Buy now
                      </button>
                      <a href="#pricing" className="btn btn-ghost btn-lg">
                        Compare all <Icon name="arrowDown" />
                      </a>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="pdp-price">
                <span className="now">{money(product.price)}</span>
                {wasPrice > product.price && (
                  <>
                    <span className="was">{money(wasPrice)}</span>
                    <span className={`save-badge ${discount ? 'on-sale' : ''}`}>
                      {discount ? offerText(discount, product.discountLabel) : `Save ${save}%`}
                    </span>
                  </>
                )}
              </div>
            )}

            {!hasPackages && (
            <>
            <ul className="pdp-feats">
              {features.map((f) => (
                <li key={f}>
                  <Icon name="check" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="pdp-buy">
              <div className="qty">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease">
                  &minus;
                </button>
                <input
                  type="number"
                  min="1"
                  max={product.stock}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(product.stock, parseInt(e.target.value, 10) || 1)))}
                  aria-label="Quantity"
                />
                <button
                  onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                  disabled={qty >= product.stock}
                  aria-label="Increase"
                >
                  +
                </button>
              </div>

              <button className="btn btn-primary btn-lg" onClick={addToCart} disabled={!inStock}>
                <Icon name="cart" /> Add to Cart
              </button>
              <button className="btn btn-outline btn-lg" onClick={buyNow} disabled={!inStock}>
                Buy now
              </button>
            </div>
            </>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
              {!hasPackages && (
                <span style={{ color: inStock ? '#059669' : 'var(--bad)', fontWeight: 600 }}>
                  {inStock ? `In stock (${num(product.stock)} available)` : 'Out of stock'}
                </span>
              )}
              {product.licenceTerm && <span className="cell-sub">{product.licenceTerm}</span>}
              {product.platforms && <span className="cell-sub">{product.platforms}</span>}
            </div>

            {deliverables.length > 0 && (
              <div className="deliverables">
                <div className="deliverables-head">
                  <Icon name="download" /> What you get after payment
                  {selectedPackage && <span className="deliverables-pkg">{selectedPackage.name}</span>}
                </div>
                {deliverables.map((d, i) => (
                  <div className="deliverable" key={i}>
                    <span className={`kpi-ic ${KIND_ACCENT[d.kind] || 'ic-blue'}`}>
                      <Icon name={KIND_ICON[d.kind] || 'file'} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{d.label}</b>
                      <span className="cell-sub" style={{ display: 'block' }}>
                        {KIND_LABEL[d.kind] || 'Download'}
                        {d.version && ` · v${d.version}`}
                        {d.size ? ` · ${fileSize(d.size)}` : d.isExternal ? ' · external link' : ''}
                        {d.packageName ? ` · ${d.packageName} only` : ''}
                      </span>
                    </span>
                    <span className="badge badge-gray plain">
                      {d.kind === 'source'
                        ? product.platforms || 'All platforms'
                        : platformLabel(d.platform)}
                    </span>
                  </div>
                ))}
                <p className="deliverables-note">
                  <Icon name="lock" /> Downloads unlock in your account as soon as payment is confirmed.
                  {otherPackageFiles > 0 &&
                    ' Other packages ship different folders — switch package above to compare.'}
                </p>
              </div>
            )}

            {demos.length > 0 && (
              <div className="panel" style={{ marginTop: 20 }}>
                <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="kpi-ic ic-blue" style={{ flex: 'none' }}><Icon name="monitor" /></span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <h3 style={{ fontSize: 13 }}>Try it before you buy</h3>
                    <p style={{ margin: 0, fontSize: 11.5 }}>A live demo is available for this product.</p>
                  </div>
                  <Link to={`/demos?product=${product.slug}`} className="btn btn-outline btn-sm">
                    <Icon name="external" /> View demo
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---------- tabs ---------- */}
        <div className="tabs">
          {[
            ['description', 'Description'],
            ['features', 'Features'],
            ['reviews', `Reviews (${reviews.length})`],
          ].map(([key, labelText]) => (
            <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {labelText}
            </button>
          ))}
        </div>

        <div style={{ maxWidth: 760 }}>
          {tab === 'description' && (
            <p style={{ fontSize: 13.5, lineHeight: 1.75 }}>{product.description || 'No description available.'}</p>
          )}

          {tab === 'features' && (
            <ul className="pdp-feats">
              {features.length ? (
                features.map((f) => (
                  <li key={f}>
                    <Icon name="check" />
                    <span>{f}</span>
                  </li>
                ))
              ) : (
                <li>No features listed.</li>
              )}
            </ul>
          )}

          {tab === 'reviews' &&
            (reviews.length ? (
              reviews.map((r) => (
                <div className="review" key={r.id}>
                  <div className="review-top">
                    <Stars rating={r.rating} />
                    <b>{r.title}</b>
                  </div>
                  <p>{r.body}</p>
                  <ImageStrip images={r.images} caption={`${r.author} on ${product.name}`} />
                  <div className="cell-sub" style={{ marginTop: 6 }}>
                    {r.author} &middot; {date(r.createdAt)}
                    {r.images?.length > 0 && (
                      <> &middot; {r.images.length} photo{r.images.length === 1 ? '' : 's'}</>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Empty icon="star">No reviews yet for this product.</Empty>
            ))}
        </div>

        {/* related sits after the pricing block on tiered products - see below */}
        {!hasPackages && related.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <div className="section-head">
              <h2>You might also like</h2>
            </div>
            <div className="product-grid">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={(prod) => add({ productId: prod.id }, 1)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {hasPackages && (
        <>
          <div id="pricing">
            <PricingSection pricing={pricing} onBuyPackage={buyPackage} onBuyAddon={buyAddon} />
          </div>

          {/* ---------- related, after the add-ons pricing ---------- */}
          {related.length > 0 && (
            <section className="section section-soft">
              <div className="container">
                <div className="section-head">
                  <h2>You might also like</h2>
                </div>
                <div className="product-grid">
                  {related.map((p) => (
                    <ProductCard key={p.id} product={p} onAdd={(prod) => add({ productId: prod.id }, 1)} />
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {previewAt !== null && (
        <ImageSlider
          images={previewImages.map((i) => i.url)}
          captions={previewImages.map((i) => i.caption)}
          startIndex={previewAt}
          caption={product.name}
          onClose={() => setPreviewAt(null)}
        />
      )}
    </section>
  );
}
