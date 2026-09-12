import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Pager } from '../../components/ui';
import { money, date, label, statusClass, num } from '../../utils/format';

const TABS = [
  ['', 'All'],
  ['pending', 'Pending'],
  ['processing', 'Processing'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

export default function AccountOrders() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { toggleSidebar } = useOutletContext();

  useEffect(() => {
    setData(null);
    const q = new URLSearchParams({ status, page: String(page) });
    api.get(`/account/orders?${q}`).then(setData).catch((e) => setError(e.message));
  }, [status, page]);

  return (
    <>
      <PageHeader
        title="My Orders"
        subtitle={data ? `${num(data.total)} order${data.total === 1 ? '' : 's'}` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={<Link to="/products" className="btn btn-primary btn-sm">Browse products</Link>}
      />

      <div className="page">
        {error && <Alert type="error">{error}</Alert>}

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
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.orders.length ? (
              <Empty
                icon="inbox"
                action={<Link to="/products" className="btn btn-primary btn-sm">Browse products</Link>}
              >
                {status ? `No ${status} orders.` : 'You have not placed any orders yet.'}
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Products</th>
                        <th>Date</th>
                        <th className="num">Total</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((o) => (
                        <tr key={o.orderNumber}>
                          <td className="cell-main nowrap">#{o.orderNumber}</td>
                          <td>{o.items || '-'}</td>
                          <td className="nowrap">{date(o.createdAt)}</td>
                          <td className="num cell-main">{money(o.total)}</td>
                          <td>
                            <span className={`badge ${statusClass(o.status)}`}>{label(o.status)}</span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <Link to={`/account/orders/${o.orderNumber}`} className="btn btn-outline btn-sm">
                                View Details
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  perPage={data.perPage}
                  onPage={setPage}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
