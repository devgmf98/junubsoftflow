import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Kpi } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { money, num, date, timeAgo, label, statusClass } from '../../utils/format';

const FEED_STYLE = {
  order: ['ic-blue', 'inbox'],
  payment: ['ic-green', 'money'],
  account: ['ic-purple', 'user'],
  product: ['ic-orange', 'box'],
  settings: ['ic-teal', 'settings'],
};

/** Step 7 of the reference flow: My Account overview. */
export default function AccountDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const { toggleSidebar } = useOutletContext();

  useEffect(() => {
    api.get('/account/summary').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="My Account"
        subtitle={user ? `Welcome back, ${user.name.split(' ')[0]}.` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={<Link to="/products" className="btn btn-primary btn-sm">Browse products</Link>}
      />

      <div className="page">
        {error && <Alert type="error">{error}</Alert>}
        {!data ? (
          <Loading variant="dashboard" />
        ) : (
          <>
            <div className="kpi-grid">
              <Kpi label="Total Spent" value={money(data.kpis.spent)} icon="money" accent="blue" deltaLabel="Paid orders" />
              <Kpi label="Orders" value={num(data.kpis.orders)} icon="inbox" accent="green" deltaLabel="All time" />
              <Kpi label="Active Licences" value={num(data.kpis.licenses)} icon="key" accent="purple" deltaLabel="Ready to use" />
              <Kpi
                label="In Progress"
                value={num(data.kpis.pending)}
                icon="clock"
                accent="orange"
                deltaLabel={data.kpis.pending ? 'Awaiting completion' : 'Nothing pending'}
              />
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head">
                  <h3>My Orders</h3>
                  <div className="right">
                    <Link to="/account/orders" className="btn btn-ghost btn-sm">View all</Link>
                  </div>
                </div>
                <div className="panel-body tight">
                  {!data.recentOrders.length ? (
                    <Empty
                      icon="inbox"
                      action={<Link to="/products" className="btn btn-primary btn-sm">Browse products</Link>}
                    >
                      You have not placed any orders yet.
                    </Empty>
                  ) : (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Product</th>
                            <th className="num">Total</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentOrders.map((o) => (
                            <tr key={o.orderNumber}>
                              <td className="cell-main nowrap">#{o.orderNumber}</td>
                              <td>
                                <span style={{ display: 'block' }}>{o.items || '-'}</span>
                                <span className="cell-sub">{date(o.createdAt)}</span>
                              </td>
                              <td className="num cell-main">{money(o.total)}</td>
                              <td>
                                <span className={`badge ${statusClass(o.status)}`}>{label(o.status)}</span>
                              </td>
                              <td>
                                <div className="row-actions">
                                  <Link to={`/account/orders/${o.orderNumber}`} className="btn btn-ghost btn-sm">
                                    View Details
                                  </Link>
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

              <div>
                <div className="panel">
                  <div className="panel-head"><h3>Quick Actions</h3></div>
                  <div className="panel-body">
                    <div className="quick-links">
                      <Link to="/account/licenses" className="quick-link"><Icon name="key" /> Licences</Link>
                      <Link to="/account/downloads" className="quick-link"><Icon name="download" /> Downloads</Link>
                      <Link to="/account/support" className="quick-link"><Icon name="headset" /> Support</Link>
                      <Link to="/account/settings" className="quick-link"><Icon name="settings" /> Settings</Link>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head"><h3>Recent Activity</h3></div>
                  <div className="panel-body">
                    {!data.activity.length ? (
                      <Empty icon="bell">Nothing here yet.</Empty>
                    ) : (
                      <div className="feed">
                        {data.activity.map((a) => {
                          const [cls, icon] = FEED_STYLE[a.type] || ['ic-blue', 'info'];
                          return (
                            <div className="feed-item" key={a.id}>
                              <span className={`feed-ic ${cls}`}><Icon name={icon} /></span>
                              <span className="feed-txt">{a.message}</span>
                              <span className="feed-time">{timeAgo(a.createdAt)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
