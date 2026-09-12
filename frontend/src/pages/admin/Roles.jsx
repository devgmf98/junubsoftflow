import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { num, label } from '../../utils/format';

const BLANK = { name: '', description: '', permissions: [] };

/** Admin page 8: roles & permissions. */
export default function AdminRoles() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api.get('/admin/roles').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePermission = (perm) => {
    setEditing((r) => ({
      ...r,
      permissions: r.permissions.includes(perm)
        ? r.permissions.filter((p) => p !== perm)
        : [...r.permissions, perm],
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing.id) {
        await api.put(`/admin/roles/${editing.id}`, editing);
        toast.ok(`The ${editing.name} role was updated.`);
      } else {
        await api.post('/admin/roles', editing);
        toast.ok(`The ${editing.name} role was created.`);
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role) => {
    if (!window.confirm(`Delete the ${role.name} role?`)) return;
    try {
      await api.del(`/admin/roles/${role.id}`);
      toast.ok(`The ${role.name} role was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Who can do what in the admin console"
        onToggleSidebar={toggleSidebar}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>
            <Icon name="plus" /> Add Role
          </button>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="panel">
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.roles.length ? (
              <Empty icon="lock">No roles defined.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Description</th>
                      <th>Permissions</th>
                      <th className="num">Users</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.roles.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="cell-main">{r.name}</span>
                          {r.isSystem && <span className="cell-sub" style={{ display: 'block' }}>System role</span>}
                        </td>
                        <td>{r.description || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {data.allPermissions.map((p) => (
                              <span
                                key={p}
                                className={`badge ${r.permissions.includes(p) ? 'badge-green' : 'badge-gray'}`}
                                style={!r.permissions.includes(p) ? { opacity: 0.45 } : undefined}
                              >
                                {label(p)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="num">{num(r.userCount)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditing({ ...r, permissions: [...r.permissions] })}
                              title="Edit"
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--bad)', opacity: r.isSystem ? 0.4 : 1 }}
                              onClick={() => remove(r)}
                              disabled={r.isSystem}
                              title={r.isSystem ? 'System roles cannot be deleted' : 'Delete'}
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

        <div className="panel">
          <div className="panel-body" style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
            <span className="kpi-ic ic-blue" style={{ flex: 'none' }}><Icon name="info" /></span>
            <div>
              <h3 style={{ fontSize: 13, marginBottom: 4 }}>How permissions work</h3>
              <p style={{ margin: 0, fontSize: 12 }}>
                <b>View</b> grants read-only access to the admin console. <b>Edit</b> adds creating and updating
                records. <b>Delete</b> allows removing them. System roles are protected so the store always has at
                least one full administrator.
              </p>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit the ${editing.name} role` : 'Add a role'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving...' : editing.id ? 'Save changes' : 'Create role'}
              </button>
            </>
          }
        >
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="r-name">Role name</label>
              <input id="r-name" value={editing.name} onChange={(e) => setEditing((r) => ({ ...r, name: e.target.value }))} required placeholder="Manager" />
            </div>
            <div className="field">
              <label htmlFor="r-desc">Description</label>
              <input
                id="r-desc"
                value={editing.description || ''}
                onChange={(e) => setEditing((r) => ({ ...r, description: e.target.value }))}
                placeholder="Manage orders and customers"
              />
            </div>
            <div className="field">
              <label>Permissions</label>
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                {(data?.allPermissions || []).map((p) => (
                  <label key={p} className="field-check">
                    <input
                      type="checkbox"
                      checked={editing.permissions.includes(p)}
                      onChange={() => togglePermission(p)}
                    />
                    <span>
                      <b style={{ color: 'var(--ink)' }}>{label(p)}</b>
                      <span className="cell-sub" style={{ display: 'block' }}>
                        {p === 'view'
                          ? 'Read-only access to the admin console'
                          : p === 'edit'
                          ? 'Create and update records'
                          : 'Remove records permanently'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
