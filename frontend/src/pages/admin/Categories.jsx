import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon, { ICON_NAMES } from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { num, label, statusClass, accentStyle } from '../../utils/format';

const ACCENTS = ['blue', 'green', 'purple', 'orange', 'teal'];
const BLANK = { name: '', description: '', icon: 'box', accent: 'blue', status: 'active' };

/** Admin page 5: category management. */
export default function AdminCategories() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api.get('/admin/categories').then((d) => setRows(d.categories)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => setEditing((c) => ({ ...c, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing.id) {
        await api.put(`/admin/categories/${editing.id}`, editing);
        toast.ok(`${editing.name} was updated.`);
      } else {
        await api.post('/admin/categories', editing);
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

  const remove = async (category) => {
    if (
      !window.confirm(
        `Delete ${category.name}? Its ${category.productCount} product(s) become uncategorised.`
      )
    ) {
      return;
    }
    try {
      await api.del(`/admin/categories/${category.id}`);
      toast.ok(`${category.name} was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle={rows ? `${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>
            <Icon name="plus" /> Add Category
          </button>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="panel">
          <div className="panel-body tight">
            {!rows ? (
              <Loading />
            ) : !rows.length ? (
              <Empty
                icon="tag"
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>
                    Add Category
                  </button>
                }
              >
                No categories yet.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th className="num">Products</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="cell-user">
                            <span className="kpi-ic" style={{ ...accentStyle(c.accent), width: 32, height: 32 }}>
                              <Icon name={c.icon} />
                            </span>
                            <span>
                              <span className="cell-main">{c.name}</span>
                              <span className="cell-sub" style={{ display: 'block' }}>/{c.slug}</span>
                            </span>
                          </div>
                        </td>
                        <td>{c.description || '-'}</td>
                        <td className="num">{num(c.productCount)}</td>
                        <td>
                          <span className={`badge ${statusClass(c.status)}`}>{label(c.status)}</span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...c })} title="Edit">
                              <Icon name="edit" />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--bad)' }}
                              onClick={() => remove(c)}
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
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit ${editing.name}` : 'Add a category'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving...' : editing.id ? 'Save changes' : 'Add category'}
              </button>
            </>
          }
        >
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="cat-name">Name</label>
              <input id="cat-name" value={editing.name} onChange={set('name')} required placeholder="Productivity" />
            </div>
            <div className="field">
              <label htmlFor="cat-desc">Description</label>
              <input
                id="cat-desc"
                value={editing.description || ''}
                onChange={set('description')}
                placeholder="Office tools and productivity apps"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="cat-icon">Icon</label>
                <select id="cat-icon" value={editing.icon} onChange={set('icon')}>
                  {ICON_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="cat-accent">Colour</label>
                <select id="cat-accent" value={editing.accent} onChange={set('accent')}>
                  {ACCENTS.map((a) => (
                    <option key={a} value={a}>{label(a)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="cat-status">Status</label>
              <select id="cat-status" value={editing.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 11,
                alignItems: 'center',
                padding: 12,
                border: '1px solid var(--line-2)',
                borderRadius: 10,
                background: 'var(--bg-soft)',
              }}
            >
              <span className="kpi-ic" style={{ ...accentStyle(editing.accent), flex: 'none' }}>
                <Icon name={editing.icon} />
              </span>
              <span>
                <b style={{ fontSize: 12, color: 'var(--ink)' }}>{editing.name || 'Category name'}</b>
                <span className="cell-sub" style={{ display: 'block' }}>Preview</span>
              </span>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
