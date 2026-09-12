import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { money, num, label, statusClass } from '../../utils/format';

const TYPE_LABEL = { regular: 'Regular', extended: 'Extended', agency: 'Agency' };

const BLANK = {
  licenseType: 'regular',
  name: '',
  tagline: '',
  price: '',
  comparePrice: '',
  licenseCount: 1,
  isPopular: false,
  ctaLabel: 'Buy Now',
  status: 'active',
  included: '',
  addons: '',
  benefits: '',
};

const BLANK_ADDON = { name: '', description: '', regularPrice: '', extendedPrice: '', status: 'active' };

/** nulls from the API become empty strings so the inputs stay controlled */
const addonForForm = (a) => ({
  ...a,
  description: a.description || '',
  regularPrice: a.regularPrice ?? '',
  extendedPrice: a.extendedPrice ?? '',
});

/** Tiered pricing for one product: packages, licence matrix and add-ons. */
export default function AdminProductPackages() {
  const toast = useToast();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [addon, setAddon] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('regular');
  const [matrix, setMatrix] = useState([]);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api
      .get(`/admin/products/${id}/packages`)
      .then((d) => {
        setData(d);
        // give each row a stable key so React keeps inputs focused while typing
        setMatrix(d.matrix.map((m, i) => ({ ...m, key: `m${m.id ?? i}` })));
        setMatrixDirty(false);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- licence comparison editing ---------- */
  const setMatrixRow = (index, patch) => {
    setMatrix((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setMatrixDirty(true);
  };

  const addMatrixRow = () => {
    setMatrix((rows) => [
      ...rows,
      { key: `new-${Date.now()}-${rows.length}`, licenseType: tab === 'agency' ? 'regular' : tab, label: '', included: true },
    ]);
    setMatrixDirty(true);
  };

  const dropMatrixRow = (index) => {
    setMatrix((rows) => rows.filter((_, i) => i !== index));
    setMatrixDirty(true);
  };

  const saveMatrix = async () => {
    setBusy(true);
    setError('');
    try {
      const rows = matrix
        .filter((r) => r.label.trim())
        .map((r) => ({ licenseType: r.licenseType, label: r.label.trim(), included: r.included }));
      const res = await api.put(`/admin/products/${id}/license-matrix`, { rows });
      toast.ok(`Licence comparison saved (${res.rows} row${res.rows === 1 ? '' : 's'}).`);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setEditing((p) => ({ ...p, [key]: value }));
  };

  const savePackage = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...editing,
        included: editing.included.split('\n'),
        addons: editing.addons.split('\n'),
        benefits: editing.benefits.split('\n'),
      };
      if (editing.id) {
        await api.put(`/admin/products/${id}/packages/${editing.id}`, payload);
        toast.ok(`${editing.name} was updated.`);
      } else {
        await api.post(`/admin/products/${id}/packages`, payload);
        toast.ok(`${editing.name} was added.`);
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removePackage = async (pkg) => {
    if (!window.confirm(`Delete the ${pkg.name} package?`)) return;
    try {
      await api.del(`/admin/products/${id}/packages/${pkg.id}`);
      toast.ok(`${pkg.name} was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const saveAddon = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (addon.id) {
        await api.put(`/admin/products/${id}/addons/${addon.id}`, addon);
        toast.ok(`${addon.name} was updated.`);
      } else {
        await api.post(`/admin/products/${id}/addons`, addon);
        toast.ok(`${addon.name} was added.`);
      }
      setAddon(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeAddon = async (a) => {
    if (!window.confirm(`Delete the add-on "${a.name}"?`)) return;
    try {
      await api.del(`/admin/products/${id}/addons/${a.id}`);
      toast.ok(`${a.name} was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const openNew = () => setEditing({ ...BLANK, licenseType: tab });

  const openEdit = (pkg) =>
    setEditing({
      ...pkg,
      comparePrice: pkg.comparePrice ?? '',
      tagline: pkg.tagline || '',
      included: (pkg.included || []).join('\n'),
      addons: (pkg.addons || []).join('\n'),
      benefits: (pkg.benefits || []).join('\n'),
    });

  const shown = (data?.packages || []).filter((p) => p.licenseType === tab);

  return (
    <>
      <PageHeader
        title={data ? `${data.product.name} — Packages` : 'Packages'}
        subtitle="Tiered pricing, licence comparison and premium add-ons"
        onToggleSidebar={toggleSidebar}
        actions={
          <>
            <Link to="/admin/products" className="btn btn-outline btn-sm">Back to products</Link>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              <Icon name="plus" /> Add package
            </button>
          </>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          !error && <Loading variant="panel" />
        ) : (
          <>
            {data.product.pricingMode !== 'packages' && (
              <Alert type="info">
                This product is set to <b>Single price</b>, so these packages are not shown on the storefront.
                Switch its Pricing to <b>Tiered packages</b> on the{' '}
                <Link to="/admin/products">Products page</Link> to use them.
              </Alert>
            )}

            <div className="toolbar">
              <div className="pill-tabs">
                {data.licenseTypes.map((t) => {
                  const n = data.packages.filter((p) => p.licenseType === t).length;
                  return (
                    <button key={t} className={`pill-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                      {TYPE_LABEL[t]}
                      <span className="n">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>{TYPE_LABEL[tab]} packages</h3>
                <div className="right cell-sub">{shown.length} tier{shown.length === 1 ? '' : 's'}</div>
              </div>
              <div className="panel-body tight">
                {!shown.length ? (
                  <Empty
                    icon="tag"
                    action={<button className="btn btn-primary btn-sm" onClick={openNew}>Add package</button>}
                  >
                    No {TYPE_LABEL[tab].toLowerCase()} packages yet.
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Package</th>
                          <th className="num">Price</th>
                          <th className="num">Was</th>
                          <th className="num">Licences</th>
                          <th>Lines</th>
                          <th>Folder</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <span className="cell-main">
                                {p.name}
                                {p.isPopular && <span className="badge badge-green plain" style={{ marginLeft: 8 }}>Most popular</span>}
                              </span>
                              {p.tagline && <span className="cell-sub" style={{ display: 'block' }}>{p.tagline}</span>}
                            </td>
                            <td className="num cell-main">{money(p.price, false)}</td>
                            <td className="num">{p.comparePrice ? money(p.comparePrice, false) : '-'}</td>
                            <td className="num">{num(p.licenseCount)}</td>
                            <td className="cell-sub">
                              {p.included.length} incl · {p.addons.length} add-on · {p.benefits.length} benefit
                            </td>
                            <td>
                              <Link
                                to={`/admin/packages/${p.id}/files`}
                                className="btn btn-ghost btn-sm"
                                title="Source folder delivered to buyers of this package"
                              >
                                <Icon name="box" />
                                {p.fileCount
                                  ? `${p.fileCount} file${p.fileCount === 1 ? '' : 's'}`
                                  : 'Upload'}
                              </Link>
                            </td>
                            <td>
                              <span className={`badge ${statusClass(p.status)}`}>{label(p.status)}</span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Edit">
                                  <Icon name="edit" />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--bad)' }}
                                  onClick={() => removePackage(p)}
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
                )}
              </div>
            </div>

            {/* ---------- add-ons ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Premium add-ons</h3>
                <div className="right">
                  <button className="btn btn-outline btn-sm" onClick={() => setAddon({ ...BLANK_ADDON })}>
                    <Icon name="plus" /> Add add-on
                  </button>
                </div>
              </div>
              <div className="panel-body tight">
                {!data.addons.length ? (
                  <Empty icon="box">No add-ons yet.</Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Add-on</th>
                          <th className="num">Regular</th>
                          <th className="num">Extended</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.addons.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <span className="cell-main">{a.name}</span>
                              <span className="cell-sub" style={{ display: 'block' }}>
                                {a.fileCount
                                  ? `${a.fileCount} download${a.fileCount === 1 ? '' : 's'} attached`
                                  : 'No source code attached yet'}
                              </span>
                            </td>
                            <td className="num">{a.regularPrice === null ? '-' : money(a.regularPrice, false)}</td>
                            <td className="num">{a.extendedPrice === null ? '-' : money(a.extendedPrice, false)}</td>
                            <td>
                              <span className={`badge ${statusClass(a.status)}`}>{label(a.status)}</span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <Link
                                  to={`/admin/addons/${a.id}/files`}
                                  className="btn btn-outline btn-sm"
                                  title="Source code and builds for this add-on"
                                >
                                  <Icon name="code" /> Files
                                </Link>
                                <button className="btn btn-ghost btn-sm" onClick={() => setAddon(addonForForm(a))} title="Edit">
                                  <Icon name="edit" />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--bad)' }}
                                  onClick={() => removeAddon(a)}
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
                )}
              </div>
            </div>

            {/* ---------- licence matrix ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Licence comparison</h3>
                <div className="sub">Powers the &quot;Which License to Purchase?&quot; table</div>
                <div className="right">
                  {matrixDirty && <span className="cell-sub">Unsaved changes</span>}
                  <button className="btn btn-outline btn-sm" onClick={addMatrixRow}>
                    <Icon name="plus" /> Add row
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={saveMatrix} disabled={busy || !matrixDirty}>
                    {busy ? 'Saving...' : 'Save comparison'}
                  </button>
                </div>
              </div>
              <div className="panel-body tight">
                {!matrix.length ? (
                  <Empty
                    icon="lock"
                    action={<button className="btn btn-primary btn-sm" onClick={addMatrixRow}>Add the first row</button>}
                  >
                    No comparison rows yet.
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th style={{ width: 150 }}>Licence</th>
                          <th>Row label</th>
                          <th style={{ width: 130 }}>Included</th>
                          <th style={{ width: 60 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.map((r, i) => (
                          <tr key={r.key}>
                            <td>
                              <select
                                value={r.licenseType}
                                onChange={(e) => setMatrixRow(i, { licenseType: e.target.value })}
                                style={{ width: '100%' }}
                              >
                                {['regular', 'extended'].map((t) => (
                                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                value={r.label}
                                onChange={(e) => setMatrixRow(i, { label: e.target.value })}
                                placeholder="Lifetime FREE Update"
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td>
                              <label className="field-check" style={{ margin: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={r.included}
                                  onChange={(e) => setMatrixRow(i, { included: e.target.checked })}
                                />
                                {r.included ? 'Included' : 'Excluded'}
                              </label>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--bad)' }}
                                  onClick={() => dropMatrixRow(i)}
                                  title="Remove row"
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
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------- package modal ---------- */}
      {editing && (
        <Modal
          wide
          title={editing.id ? `Edit ${editing.name}` : 'Add a package'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePackage} disabled={busy}>
                {busy ? 'Saving...' : editing.id ? 'Save changes' : 'Add package'}
              </button>
            </>
          }
        >
          <form onSubmit={savePackage}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="k-type">Licence type</label>
                <select id="k-type" value={editing.licenseType} onChange={set('licenseType')}>
                  {(data?.licenseTypes || ['regular', 'extended', 'agency']).map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="k-name">Package name</label>
                <input id="k-name" value={editing.name} onChange={set('name')} placeholder="Super Combo" required />
              </div>
            </div>

            <div className="field">
              <label htmlFor="k-tagline">Tagline</label>
              <input
                id="k-tagline"
                value={editing.tagline}
                onChange={set('tagline')}
                placeholder="For agencies with a steady client pipeline"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="k-price">Price (USD)</label>
                <input id="k-price" type="number" step="0.01" min="0" value={editing.price} onChange={set('price')} required />
              </div>
              <div className="field">
                <label htmlFor="k-compare">Compare-at price</label>
                <input
                  id="k-compare"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editing.comparePrice}
                  onChange={set('comparePrice')}
                  placeholder="Drives the SAVE % badge"
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="k-count">Licences included</label>
                <input id="k-count" type="number" min="1" value={editing.licenseCount} onChange={set('licenseCount')} />
                <div className="field-hint">More than 1 shows a &quot;per license&quot; figure and issues that many keys.</div>
              </div>
              <div className="field">
                <label htmlFor="k-cta">Button label</label>
                <input id="k-cta" value={editing.ctaLabel} onChange={set('ctaLabel')} placeholder="Buy Now" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="k-inc">Included <span style={{ fontWeight: 400, color: '#94a3b8' }}>(one per line)</span></label>
              <textarea
                id="k-inc"
                value={editing.included}
                onChange={set('included')}
                placeholder={'Admin Panel\nVendor Panel\nCustomer App\nLanding page'}
              />
            </div>

            <div className="field">
              <label htmlFor="k-add">Premium add-ons included</label>
              <textarea
                id="k-add"
                value={editing.addons}
                onChange={set('addons')}
                placeholder={'Vendor App\nDeliveryman App\nReact Website'}
              />
            </div>

            <div className="field">
              <label htmlFor="k-ben">Agency benefits</label>
              <textarea
                id="k-ben"
                value={editing.benefits}
                onChange={set('benefits')}
                placeholder={'White-label / rebranding rights\n12 months support'}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="k-status">Status</label>
                <select id="k-status" value={editing.status} onChange={set('status')}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label className="field-check">
                  <input type="checkbox" checked={Boolean(editing.isPopular)} onChange={set('isPopular')} />
                  Mark as Most Popular
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- add-on modal ---------- */}
      {addon && (
        <Modal
          title={addon.id ? `Edit ${addon.name}` : 'Add a premium add-on'}
          onClose={() => setAddon(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setAddon(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAddon} disabled={busy}>
                {busy ? 'Saving...' : addon.id ? 'Save changes' : 'Add add-on'}
              </button>
            </>
          }
        >
          <form onSubmit={saveAddon}>
            <div className="field">
              <label htmlFor="a-name">Name</label>
              <input
                id="a-name"
                value={addon.name}
                onChange={(e) => setAddon((a) => ({ ...a, name: e.target.value }))}
                placeholder="Vendor App"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="a-desc">Description</label>
              <input
                id="a-desc"
                value={addon.description}
                onChange={(e) => setAddon((a) => ({ ...a, description: e.target.value }))}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="a-reg">Regular price</label>
                <input
                  id="a-reg"
                  type="number"
                  step="0.01"
                  min="0"
                  value={addon.regularPrice}
                  onChange={(e) => setAddon((a) => ({ ...a, regularPrice: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="a-ext">Extended price</label>
                <input
                  id="a-ext"
                  type="number"
                  step="0.01"
                  min="0"
                  value={addon.extendedPrice}
                  onChange={(e) => setAddon((a) => ({ ...a, extendedPrice: e.target.value }))}
                />
              </div>
            </div>
            <div className="field-hint">Leave a price empty to hide that licence column for this add-on.</div>
          </form>
        </Modal>
      )}
    </>
  );
}
