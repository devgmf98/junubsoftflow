import { useEffect, useState, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import ProductThumb from '../../components/ProductThumb';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Pager, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { money, num, label, statusClass, fileSize, platformLabel, offerText } from '../../utils/format';

/** The campaigns a store actually runs - typed freely, these are just shortcuts. */
const DISCOUNT_REASONS = [
  'Black Friday',
  'Cyber Monday',
  'Launch offer',
  'Summer sale',
  'Clearance',
  'Bundle deal',
  'Student offer',
];

const BLANK = {
  name: '', categoryId: '', sku: '', vendor: '', shortDesc: '', description: '',
  price: '', comparePrice: '', discountPercent: '', discountLabel: '', announceDiscount: true,
  stock: '', licenceTerm: '', platforms: '', badge: '',
  pricingMode: 'simple', isFeatured: false, status: 'active', features: '',
};

/**
 * Mirrors the server's SKU rule so the form can preview it live.
 * The server still has the last word - it also resolves collisions.
 */
function previewSku(name) {
  const core = String(name || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? word : word.slice(0, 3)))
    .join('')
    .slice(0, 12);
  return 'SF-' + (core || 'PROD');
}

/** Admin page 2: product management. */
export default function AdminProducts() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', category: '', status: '' });
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [mainImage, setMainImage] = useState(null);
  const [dropImage, setDropImage] = useState(false);
  const { toggleSidebar } = useOutletContext();

  // local object URL for the newly picked file, otherwise whatever is stored
  const mainPreview = mainImage
    ? URL.createObjectURL(mainImage)
    : dropImage
    ? null
    : editing?.imageUrl || null;

  const clearMainImage = () => {
    setMainImage(null);
    setDropImage(true);
  };

  const closeModal = () => {
    setEditing(null);
    setPreviewFiles([]);
    setBundles([]);
    setMainImage(null);
    setDropImage(false);
  };

  const addBundle = (kind) =>
    setBundles((b) => [
      ...b,
      {
        key: `${kind}-${Date.now()}`,
        kind,
        label: kind === 'source' ? 'Source code' : kind === 'apk' ? 'Android build' : 'Installer',
        platform: kind === 'apk' ? 'android' : 'web',
        version: '',
        files: [],
      },
    ]);

  const setBundle = (key, patch) =>
    setBundles((b) => b.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const dropBundle = (key) => setBundles((b) => b.filter((x) => x.key !== key));

  const load = useCallback(() => {
    setData(null);
    const q = new URLSearchParams({ ...filters, page: String(page) });
    api.get(`/admin/products?${q}`).then(setData).catch((e) => setError(e.message));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/admin/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  const openNew = () => {
    setMainImage(null);
    setDropImage(false);
    setPreviewFiles([]);
    setBundles([]);
    setEditing({ ...BLANK });
  };

  const openEdit = async (id) => {
    try {
      const { product } = await api.get(`/admin/products/${id}`);
      setMainImage(null);
      setDropImage(false);
      setPreviewFiles([]);
      setBundles([]);
      setEditing({
        ...product,
        categoryId: product.categoryId || '',
        comparePrice: product.comparePrice ?? '',
        discountPercent: product.discountPercent || '',
        discountLabel: product.discountLabel || '',
        // an existing product with no stored value predates the column - default to yes
        announceDiscount: product.announceDiscount !== false,
        features: (product.features || []).join('\n'),
      });
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setEditing((p) => ({ ...p, [key]: value }));
  };

  /** Uploads the preview images and the source/APK bundles picked in the modal. */
  const uploadAttachments = async (productId) => {
    const notes = [];

    if (mainImage) {
      const fd = new FormData();
      fd.append('image', mainImage);
      await api.upload(`/admin/products/${productId}/image`, fd);
      notes.push('product image');
    } else if (dropImage && editing.imageUrl) {
      await api.del(`/admin/products/${productId}/image`);
      notes.push('image removed');
    }

    if (previewFiles.length) {
      const fd = new FormData();
      previewFiles.forEach((f) => fd.append('images', f));
      await api.upload(`/admin/products/${productId}/images`, fd);
      notes.push(`${previewFiles.length} preview image${previewFiles.length === 1 ? '' : 's'}`);
    }

    for (const bundle of bundles) {
      if (!bundle.files.length) continue;
      const fd = new FormData();
      // the upload filename loses its directories in transit, so send the
      // relative paths alongside - appended first, in the same order as the files
      bundle.files.forEach((f) => fd.append('paths', f.webkitRelativePath || f.name));
      bundle.files.forEach((f) => fd.append('files', f, f.name));
      fd.append('kind', bundle.kind);
      fd.append('label', bundle.label);
      fd.append('platform', bundle.platform);
      if (bundle.version) fd.append('version', bundle.version);
      const res = await api.upload(`/admin/products/${productId}/bundle`, fd);
      notes.push(`${bundle.label}${res.bundled ? ` (${res.entryCount} files zipped)` : ''}`);
    }

    return notes;
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { ...editing, features: editing.features.split('\n') };
      let productId = editing.id;

      if (productId) {
        await api.put(`/admin/products/${productId}`, payload);
      } else {
        const created = await api.post('/admin/products', payload);
        productId = created.id;
      }

      const notes = await uploadAttachments(productId);
      toast.ok(
        `${editing.name} was ${editing.id ? 'updated' : 'added'}${notes.length ? ` — attached ${notes.join(', ')}.` : '.'}`
      );

      setEditing(null);
      setPreviewFiles([]);
      setBundles([]);
      setMainImage(null);
      setDropImage(false);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (product) => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await api.del(`/admin/products/${product.id}`);
      toast.ok(`${product.name} was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  // Options come from Settings, plus whatever this product already uses - editing a
  // product must never silently drop a term that was later retired from the list.
  const termOptions = (() => {
    const list = [...(data?.licenceTerms || [])];
    const current = (editing?.licenceTerm || '').trim();
    if (current && !list.some((t) => t.toLowerCase() === current.toLowerCase())) list.push(current);
    return list;
  })();

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={data ? `${num(data.total)} product${data.total === 1 ? '' : 's'} in the catalogue` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <Icon name="plus" /> Add Product
          </button>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFilters((f) => ({ ...f, search: term }));
              setPage(1);
            }}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
          >
            <div className="search-box">
              <Icon name="search" />
              <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search products..."
              />
            </div>
            <select
              value={filters.category}
              onChange={(e) => {
                setFilters((f) => ({ ...f, category: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters((f) => ({ ...f, status: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <button type="submit" className="btn btn-outline btn-sm">Filter</button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.products.length ? (
              <Empty
                icon="box"
                action={<button className="btn btn-primary btn-sm" onClick={openNew}>Add Product</button>}
              >
                No products match that filter.
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Image</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th className="num">Price</th>
                        <th className="num">Stock</th>
                        <th className="num">Sold</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <ProductThumb product={p} size={38} radius={9} />
                          </td>
                          <td>
                            <span className="cell-main">{p.name}</span>
                            <span className="cell-sub" style={{ display: 'block' }}>
                              {p.sku || 'No SKU'}
                              {p.isFeatured && ' · Featured'}
                            </span>
                          </td>
                          <td>{p.categoryName || '-'}</td>
                          <td className="num cell-main">{money(p.price)}</td>
                          <td className="num">
                            <span style={{ color: p.stock < 20 ? 'var(--bad)' : p.stock < 40 ? 'var(--warn)' : undefined }}>
                              {num(p.stock)}
                            </span>
                          </td>
                          <td className="num">{num(p.sold)}</td>
                          <td>
                            <span className={`badge ${statusClass(p.status)}`}>{label(p.status)}</span>
                          </td>
                          <td>
                            <div className="row-actions">
                              {p.pricingMode === 'packages' && (
                                <Link
                                  to={`/admin/products/${p.id}/packages`}
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--blue)' }}
                                  title="Pricing packages"
                                >
                                  <Icon name="layers" />
                                </Link>
                              )}
                              <Link
                                to={`/admin/products/${p.id}/files`}
                                className="btn btn-ghost btn-sm"
                                title={`Downloads (${p.fileCount})`}
                              >
                                <Icon name="download" />
                              </Link>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p.id)} title="Edit">
                                <Icon name="edit" />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--bad)' }}
                                onClick={() => remove(p)}
                                title="Delete"
                              >
                                <Icon name="trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={data.page} pages={data.pages} total={data.total} perPage={data.perPage} onPage={setPage} />
              </>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <Modal
          wide
          title={editing.id ? `Edit ${editing.name}` : 'Add a product'}
          onClose={closeModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving...' : editing.id ? 'Save changes' : 'Create product'}
              </button>
            </>
          }
        >
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="p-name">Product name</label>
              <input id="p-name" value={editing.name} onChange={set('name')} required placeholder="Microsoft Office 365" />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-cat">Category</label>
                <select id="p-cat" value={editing.categoryId} onChange={set('categoryId')}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="p-sku">SKU <span style={{ fontWeight: 400, color: '#94a3b8' }}>(automatic)</span></label>
                <input
                  id="p-sku"
                  value={editing.skuLocked ? editing.sku || '' : previewSku(editing.name)}
                  readOnly
                  tabIndex={-1}
                  aria-describedby="p-sku-hint"
                />
                <div className="field-hint" id="p-sku-hint">
                  {editing.skuLocked
                    ? 'Frozen because this product already appears on orders.'
                    : 'Generated from the product name. The server adds a suffix if this code is taken.'}
                </div>
              </div>
            </div>

            <div className="field">
              <label htmlFor="p-short">Short description</label>
              <input
                id="p-short"
                value={editing.shortDesc || ''}
                onChange={set('shortDesc')}
                placeholder="Productivity Suite for Business"
              />
            </div>

            <div className="field">
              <label htmlFor="p-desc">Full description</label>
              <textarea id="p-desc" value={editing.description || ''} onChange={set('description')} />
            </div>

            {/* ---------- how this product is priced ---------- */}
            <div className="field">
              <label>Pricing</label>
              <div className="mode-picker">
                {[
                  ['simple', 'Single price', 'One price with an Add to Cart button.'],
                  ['packages', 'Tiered packages', 'Starter / Combo tiers with a licence-type switch.'],
                ].map(([value, title, hint]) => (
                  <label key={value} className={`mode-option ${(editing.pricingMode || 'simple') === value ? 'on' : ''}`}>
                    <input
                      type="radio"
                      name="pricingMode"
                      value={value}
                      checked={(editing.pricingMode || 'simple') === value}
                      onChange={set('pricingMode')}
                    />
                    <span>
                      <b>{title}</b>
                      <span className="cell-sub" style={{ display: 'block' }}>{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {editing.pricingMode === 'packages' && (
                <div className="field-hint">
                  {editing.id ? (
                    <>Build the tiers on the <Link to={`/admin/products/${editing.id}/packages`}>Packages page</Link>. The price below is used as the &quot;from&quot; figure.</>
                  ) : (
                    <>Save the product first, then add its tiers from the Packages page. The price below is the &quot;from&quot; figure.</>
                  )}
                </div>
              )}
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-price">
                  {editing.pricingMode === 'packages' ? 'From price (USD)' : 'Price (USD)'}
                </label>
                <input id="p-price" type="number" step="0.01" min="0" value={editing.price} onChange={set('price')} required />
              </div>
              <div className="field">
                <label htmlFor="p-compare">Compare-at price</label>
                <input
                  id="p-compare"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editing.comparePrice}
                  onChange={set('comparePrice')}
                  placeholder="Shows a Save % badge"
                />
              </div>
            </div>

            {/* a real discount: it changes what the customer is charged */}
            <div className="field-row">
              <div className="field" style={{ maxWidth: 170 }}>
                <label htmlFor="p-discount">Discount (%)</label>
                <input
                  id="p-discount"
                  type="number"
                  step="1"
                  min="0"
                  max="95"
                  value={editing.discountPercent}
                  onChange={set('discountPercent')}
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label htmlFor="p-discount-label">Reason</label>
                <input
                  id="p-discount-label"
                  list="discount-reasons"
                  value={editing.discountLabel}
                  onChange={set('discountLabel')}
                  placeholder="Black Friday"
                  maxLength={60}
                />
                {/* a datalist suggests, it does not restrict - any wording is accepted,
                    and each product can carry a different one */}
                <datalist id="discount-reasons">
                  {DISCOUNT_REASONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                <div className="field-hint">
                  Pick one or type your own. Each product can have a different reason.
                </div>
              </div>
            </div>

            <label className="field-check">
              <input
                type="checkbox"
                checked={Boolean(editing.announceDiscount)}
                onChange={set('announceDiscount')}
                disabled={!Number(editing.discountPercent)}
              />
              Announce this discount in the deals email
            </label>

            <div className="field-row">
              <div className="field">
                <div className="discount-preview">
                  {Number(editing.discountPercent) > 0 && Number(editing.price) > 0 ? (
                    <>
                      <span className="badge badge-green">
                        {offerText(Number(editing.discountPercent), editing.discountLabel)}
                      </span>
                      <span className="was">{money(Number(editing.price))}</span>
                      <b>{money(Number(editing.price) * (1 - Number(editing.discountPercent) / 100))}</b>
                      <span className="cell-sub">is what the customer pays</span>
                      <span className="cell-sub">
                        {editing.announceDiscount
                          ? '· included in the deals email'
                          : '· live on the store, left out of the deals email'}
                      </span>
                    </>
                  ) : (
                    <span className="cell-sub">
                      {editing.discountLabel
                        ? 'Set a percentage above for this reason to appear on the storefront.'
                        : 'Leave at 0 for no discount. A discounted product is excluded from the '
                          + 'checkout discount, so the two never stack.'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-stock">Stock</label>
                <input id="p-stock" type="number" min="0" value={editing.stock} onChange={set('stock')} required />
              </div>
              <div className="field">
                <label htmlFor="p-vendor">Vendor</label>
                <input id="p-vendor" value={editing.vendor || ''} onChange={set('vendor')} placeholder="Microsoft" />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-term">Licence term</label>
                <select id="p-term" value={editing.licenceTerm || ''} onChange={set('licenceTerm')}>
                  <option value="">No fixed term</option>
                  {termOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="field-hint">
                  Managed under <Link to="/admin/settings">Settings &rarr; General</Link>.
                </div>
              </div>
              <div className="field">
                <label htmlFor="p-plat">Platforms</label>
                <input
                  id="p-plat"
                  value={editing.platforms || ''}
                  onChange={set('platforms')}
                  placeholder="Windows & Mac"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="p-feats">Feature bullets <span style={{ fontWeight: 400, color: '#94a3b8' }}>(one per line)</span></label>
              <textarea
                id="p-feats"
                value={editing.features}
                onChange={set('features')}
                placeholder={'Word, Excel, PowerPoint, Outlook\n1 Year Subscription\nInstant Email Delivery'}
              />
            </div>

            {/* ---------- main product image ---------- */}
            <div className="field">
              <label htmlFor="p-image">Product image</label>
              <div className="image-picker">
                <span className="image-picker-preview">
                  {mainPreview ? (
                    <img src={mainPreview} alt="" />
                  ) : (
                    <Icon name="box" />
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <input
                    id="p-image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setMainImage(e.target.files?.[0] || null)}
                  />
                  <div className="field-hint">
                    {mainImage
                      ? `${mainImage.name} · ${fileSize(mainImage.size)}`
                      : 'Shown on product cards, the cart and the product page.'}
                  </div>
                </span>
                {(mainImage || editing.imageUrl) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--bad)' }}
                    onClick={clearMainImage}
                    title="Remove image"
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-badge">Badge</label>
                <input id="p-badge" value={editing.badge || ''} onChange={set('badge')} placeholder="Best Seller" />
              </div>
              <div className="field">
                <label htmlFor="p-status">Status</label>
                <select id="p-status" value={editing.status} onChange={set('status')}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <label className="field-check">
              <input type="checkbox" checked={Boolean(editing.isFeatured)} onChange={set('isFeatured')} />
              Show on the homepage as a featured product
            </label>

            {/* ---------- preview screenshots ---------- */}
            <div className="form-section">
              <div className="form-section-head">
                <Icon name="eye" /> Preview screenshots
                <span className="cell-sub">Shown in the slider when a shopper clicks Preview</span>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPreviewFiles(Array.from(e.target.files || []))}
              />
              {previewFiles.length > 0 && (
                <div className="pick-list">
                  {previewFiles.map((f) => (
                    <span className="pick" key={f.name}>
                      {f.name} <em>{fileSize(f.size)}</em>
                    </span>
                  ))}
                </div>
              )}
              <div className="field-hint">
                PNG, JPG, WebP, GIF or SVG. These are public — anyone browsing the product can see them.
              </div>
            </div>

            {/* ---------- paid deliverables ---------- */}
            <div className="form-section">
              <div className="form-section-head">
                <Icon name="lock" /> Buyer downloads
                <span className="cell-sub">Only released once payment is completed</span>
              </div>

              {bundles.map((b) => (
                <div className="bundle-row" key={b.key}>
                  <div className="bundle-top">
                    <span className={`kpi-ic ${b.kind === 'source' ? 'ic-purple' : b.kind === 'apk' ? 'ic-green' : 'ic-blue'}`}>
                      <Icon name={b.kind === 'source' ? 'code' : b.kind === 'apk' ? 'android' : 'download'} />
                    </span>
                    <input
                      value={b.label}
                      onChange={(e) => setBundle(b.key, { label: e.target.value })}
                      placeholder="Label"
                      style={{ flex: 1 }}
                    />
                    <input
                      value={b.version}
                      onChange={(e) => setBundle(b.key, { version: e.target.value })}
                      placeholder="Version"
                      style={{ width: 100 }}
                    />
                    {b.kind === 'source' ? (
                      // source builds for every platform the product supports - nothing to pick
                      <span className="bundle-platform-fixed" title="Source code is not tied to one platform">
                        All platforms
                      </span>
                    ) : (
                      <select
                        value={b.platform}
                        onChange={(e) => setBundle(b.key, { platform: e.target.value })}
                        style={{ width: 110 }}
                      >
                        {['web', 'windows', 'mac', 'linux', 'android', 'ios'].map((p) => (
                          <option key={p} value={p}>{platformLabel(p)}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--bad)' }}
                      onClick={() => dropBundle(b.key)}
                      aria-label="Remove"
                    >
                      <Icon name="trash" />
                    </button>
                  </div>

                  <input
                    type="file"
                    multiple
                    {...(b.kind === 'source' ? { webkitdirectory: '', directory: '' } : {})}
                    accept={b.kind === 'apk' ? '.apk' : undefined}
                    onChange={(e) => setBundle(b.key, { files: Array.from(e.target.files || []) })}
                  />

                  <div className="field-hint">
                    {b.files.length
                      ? `${b.files.length} file${b.files.length === 1 ? '' : 's'} selected · ${fileSize(
                          b.files.reduce((s, f) => s + f.size, 0)
                        )}${b.files.length > 1 ? ' — will be zipped into one archive' : ''}`
                      : b.kind === 'source'
                      ? 'Pick the folder holding the source code — the whole tree is uploaded and zipped.'
                      : b.kind === 'apk'
                      ? 'Pick the .apk build.'
                      : 'Pick the installer, or several files to bundle together.'}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: bundles.length ? 10 : 0 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => addBundle('source')}>
                  <Icon name="code" /> Add source folder
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => addBundle('apk')}>
                  <Icon name="android" /> Add APK
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => addBundle('installer')}>
                  <Icon name="download" /> Add installer
                </button>
              </div>

              {editing.id && (
                <div className="field-hint" style={{ marginTop: 10 }}>
                  Existing downloads for this product are managed on its{' '}
                  <Link to={`/admin/products/${editing.id}/files`}>Downloads page</Link>.
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
