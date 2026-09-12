import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Pager, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { money, num, date, dateTime, label, statusClass } from '../../utils/format';

const TABS = [
  ['', 'All'],
  ['pending', 'Pending'],
  ['processing', 'Processing'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

const NEXT_STATUS = ['pending', 'processing', 'completed', 'cancelled'];

/** Admin page 3: order management. */
export default function AdminOrders() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    setData(null);
    const q = new URLSearchParams({ status, search, page: String(page) });
    api.get(`/admin/orders?${q}`).then(setData).catch((e) => setError(e.message));
  }, [status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const view = async (id) => {
    try {
      setViewing(await api.get(`/admin/orders/${id}`));
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const changeStatus = async (order, next) => {
    if (next === 'cancelled' && !window.confirm(`Cancel order #${order.orderNumber}? Stock is returned and its keys are revoked.`)) {
      return;
    }
    try {
      await api.put(`/admin/orders/${order.id}/status`, { status: next });
      toast.ok(`Order #${order.orderNumber} is now ${next}.`);
      setViewing(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const remove = async (order) => {
    if (!window.confirm(`Delete order #${order.orderNumber}? This cannot be undone.`)) return;
    try {
      await api.del(`/admin/orders/${order.id}`);
      toast.ok(`Order #${order.orderNumber} was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={data ? `${num(data.total)} order${data.total === 1 ? '' : 's'}` : undefined}
        onToggleSidebar={toggleSidebar}
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="toolbar">
          <div className="pill-tabs">
            {TABS.map(([value, text]) => (
              <button
                key={value || 'all'}
                className={`pill-tab ${status === value ? 'on' : ''}`}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {text}
                {data && <span className="n">{value ? data.tabCounts[value] || 0 : data.tabCounts.all}</span>}
              </button>
            ))}
          </div>

          <form
            className="spacer"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(term);
              setPage(1);
            }}
            style={{ display: 'flex', gap: 8 }}
          >
            <div className="search-box">
              <Icon name="search" />
              <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Order ID, name or email"
              />
            </div>
            <button type="submit" className="btn btn-outline btn-sm">Search</button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.orders.length ? (
              <Empty icon="inbox">No orders match that filter.</Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Date</th>
                        <th className="num">Total</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((o) => (
                        <tr key={o.id}>
                          <td className="cell-main nowrap">#{o.orderNumber}</td>
                          <td>
                            <span className="cell-main">{o.customerName}</span>
                            <span className="cell-sub" style={{ display: 'block' }}>{o.customerEmail}</span>
                          </td>
                          <td className="nowrap">{date(o.createdAt)}</td>
                          <td className="num cell-main">{money(o.total)}</td>
                          <td>
                            <select
                              value={o.status}
                              onChange={(e) => changeStatus(o, e.target.value)}
                              className={`badge ${statusClass(o.status)}`}
                              style={{
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 10.5,
                                padding: '4px 9px',
                              }}
                              aria-label={`Status of order ${o.orderNumber}`}
                            >
                              {NEXT_STATUS.map((s) => (
                                <option key={s} value={s}>{label(s)}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => view(o.id)} title="View">
                                <Icon name="eye" />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--bad)' }}
                                onClick={() => remove(o)}
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

      {viewing && (
        <Modal
          wide
          title={`Order #${viewing.order.orderNumber}`}
          onClose={() => setViewing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setViewing(null)}>Close</button>
              {viewing.order.status !== 'completed' && (
                <button className="btn btn-primary" onClick={() => changeStatus(viewing.order, 'completed')}>
                  Mark completed
                </button>
              )}
            </>
          }
        >
          <div className="stat-line">
            <span>Customer</span>
            <b>{viewing.order.customerName}</b>
          </div>
          <div className="stat-line">
            <span>Email</span>
            <b>{viewing.order.customerEmail}</b>
          </div>
          {viewing.order.customerPhone && (
            <div className="stat-line"><span>Phone</span><b>{viewing.order.customerPhone}</b></div>
          )}
          <div className="stat-line">
            <span>Placed</span>
            <b>{dateTime(viewing.order.createdAt)}</b>
          </div>
          <div className="stat-line">
            <span>Payment</span>
            <span>
              {label(viewing.order.paymentMethod)}{' '}
              <span className={`badge ${statusClass(viewing.order.paymentStatus)}`}>
                {label(viewing.order.paymentStatus)}
              </span>
            </span>
          </div>

          <h4 style={{ fontSize: 12.5, margin: '18px 0 8px' }}>Items</h4>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Price</th>
                  <th className="num">Qty</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {viewing.items.map((i, idx) => (
                  <tr key={idx}>
                    <td className="cell-main">{i.productName}</td>
                    <td className="num">{money(i.unitPrice)}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num cell-main">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="stat-line"><span>Subtotal</span><b>{money(viewing.order.subtotal)}</b></div>
            {viewing.order.discount > 0 && (
              <div className="stat-line">
                <span>Discount</span>
                <b style={{ color: '#059669' }}>-{money(viewing.order.discount)}</b>
              </div>
            )}
            <div className="stat-line" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>
              <span>Total</span>
              <span>{money(viewing.order.total)}</span>
            </div>
          </div>

          {viewing.licenses.length > 0 && (
            <>
              <h4 style={{ fontSize: 12.5, margin: '18px 0 8px' }}>Licence keys</h4>
              <div style={{ display: 'grid', gap: 8 }}>
                {viewing.licenses.map((l) => (
                  <div key={l.key}>
                    <div className="cell-sub" style={{ marginBottom: 3 }}>{l.productName}</div>
                    <div className="license-key">
                      <span>{l.key}</span>
                      <span className={`badge ${statusClass(l.status)}`}>{label(l.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
