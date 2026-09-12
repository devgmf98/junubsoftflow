import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Pager, Modal, Avatar } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { money, num, date, label, statusClass } from '../../utils/format';

const BLANK = {
  name: '', email: '', password: '', phone: '', company: '', country: '', city: '', status: 'active',
};

/** Admin page 4: customer management. */
export default function AdminCustomers() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    setData(null);
    const q = new URLSearchParams({ search, status, page: String(page) });
    api.get(`/admin/customers?${q}`).then(setData).catch((e) => setError(e.message));
  }, [search, status, page]);

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
        await api.put(`/admin/customers/${editing.id}`, editing);
        toast.ok(`${editing.name} was updated.`);
      } else {
        await api.post('/admin/customers', editing);
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

  const remove = async (customer) => {
    if (!window.confirm(`Delete ${customer.name}? Their orders are removed too.`)) return;
    try {
      await api.del(`/admin/customers/${customer.id}`);
      toast.ok(`${customer.name} was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={data ? `${num(data.total)} customer${data.total === 1 ? '' : 's'}` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>
            <Icon name="plus" /> Add Customer
          </button>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(term);
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
                placeholder="Search customers..."
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
            <button type="submit" className="btn btn-outline btn-sm">Filter</button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.customers.length ? (
              <Empty icon="users">No customers match that filter.</Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th className="num">Total Orders</th>
                        <th className="num">Spent</th>
                        <th>Join Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="cell-user">
                              <Avatar name={c.name} email={c.email} size="sm" />
                              <span>
                                <span className="cell-main">{c.name}</span>
                                {c.company && <span className="cell-sub" style={{ display: 'block' }}>{c.company}</span>}
                              </span>
                            </div>
                          </td>
                          <td>{c.email}</td>
                          <td className="nowrap">{c.phone || '-'}</td>
                          <td className="num">{num(c.orderCount)}</td>
                          <td className="num cell-main">{money(c.spent)}</td>
                          <td className="nowrap">{date(c.createdAt)}</td>
                          <td>
                            <span className={`badge ${statusClass(c.status)}`}>{label(c.status)}</span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setEditing({ ...c, password: '' })}
                                title="Edit"
                              >
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
                <Pager page={data.page} pages={data.pages} total={data.total} perPage={data.perPage} onPage={setPage} />
              </>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit ${editing.name}` : 'Add a customer'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving...' : editing.id ? 'Save changes' : 'Add customer'}
              </button>
            </>
          }
        >
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="c-name">Full name</label>
              <input id="c-name" value={editing.name} onChange={set('name')} required placeholder="John Doe" />
            </div>
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input
                id="c-email"
                type="email"
                value={editing.email}
                onChange={set('email')}
                required
                disabled={Boolean(editing.id)}
                placeholder="john@example.com"
              />
              {editing.id && <div className="field-hint">The email on an existing account cannot be changed here.</div>}
            </div>

            {!editing.id && (
              <div className="field">
                <label htmlFor="c-pass">Temporary password</label>
                <input
                  id="c-pass"
                  value={editing.password}
                  onChange={set('password')}
                  required
                  placeholder="At least 6 characters"
                />
                <div className="field-hint">Share this with them and ask them to change it after signing in.</div>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="c-phone">Phone</label>
                <input id="c-phone" value={editing.phone || ''} onChange={set('phone')} placeholder="+211 912345678" />
              </div>
              <div className="field">
                <label htmlFor="c-company">Company</label>
                <input id="c-company" value={editing.company || ''} onChange={set('company')} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="c-country">Country</label>
                <input id="c-country" value={editing.country || ''} onChange={set('country')} />
              </div>
              <div className="field">
                <label htmlFor="c-city">City</label>
                <input id="c-city" value={editing.city || ''} onChange={set('city')} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="c-status">Status</label>
              <select id="c-status" value={editing.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
