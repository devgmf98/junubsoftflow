import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Kpi, LineChart, BarList } from '../../components/ui';
import { money, num, date, timeAgo, label, statusClass, accentStyle } from '../../utils/format';

/** Admin page 1: dashboard overview. */
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { toggleSidebar } = useOutletContext();

  useEffect(() => {
    api.get('/admin/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Store performance at a glance"
        onToggleSidebar={toggleSidebar}
        actions={
          <>
            <Link to="/admin/reports" className="btn btn-outline btn-sm">
              <Icon name="chart" /> Reports
            </Link>
            <Link to="/admin/products" className="btn btn-primary btn-sm">
              <Icon name="plus" /> Add Product
            </Link>
          </>
        }
      />

      <div className="page">
        {error && <Alert type="error">{error}</Alert>}

        {!data ? (
          <Loading variant="dashboard" />
        ) : (
          <>
            <div className="kpi-grid">
              <Kpi label="Total Revenue" value={money(data.kpis.revenue, false)} icon="money" accent="blue" delta={data.kpis.revenueGrowth} />
              <Kpi label="Total Orders" value={num(data.kpis.orders)} icon="inbox" accent="green" delta={data.kpis.orderGrowth} />
              <Kpi label="Active Customers" value={num(data.kpis.customers)} icon="users" accent="purple" delta={data.kpis.customerGrowth} />
              <Kpi label="Products" value={num(data.kpis.products)} icon="box" accent="orange" deltaLabel="Live in the catalogue" />
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Revenue Overview</h3>
                    <div className="sub">Paid orders, last 12 months</div>
                  </div>
                  <div className="right chart-legend">
                    <span><i style={{ background: '#2563eb' }} />Revenue</span>
                  </div>
                </div>
                <div className="panel-body">
                  <LineChart series={data.series} id="adminRev" money />
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h3>Top Products</h3>
                  <div className="right">
                    <Link to="/admin/reports" className="btn btn-ghost btn-sm">Reports</Link>
                  </div>
                </div>
                <div className="panel-body">
                  {!data.topProducts.length ? (
                    <Empty icon="box">No sales yet.</Empty>
                  ) : (
                    <BarList
                      rows={data.topProducts.map((p) => ({
                        label: p.name,
                        hint: `${num(p.units)} sold`,
                        value: p.revenue,
                      }))}
                      formatValue={(v) => money(v, false)}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head">
                  <h3>Recent Orders</h3>
                  <div className="right">
                    <Link to="/admin/orders" className="btn btn-ghost btn-sm">View all</Link>
                  </div>
                </div>
                <div className="panel-body tight">
                  {!data.recentOrders.length ? (
                    <Empty icon="inbox">No orders yet.</Empty>
                  ) : (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Date</th>
                            <th className="num">Total</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentOrders.map((o) => (
                            <tr key={o.id}>
                              <td className="cell-main nowrap">#{o.orderNumber}</td>
                              <td>
                                <span className="cell-main">{o.customerName}</span>
                                <span className="cell-sub" style={{ display: 'block' }}>{o.items}</span>
                              </td>
                              <td className="nowrap">{date(o.createdAt)}</td>
                              <td className="num cell-main">{money(o.total)}</td>
                              <td>
                                <span className={`badge ${statusClass(o.status)}`}>{label(o.status)}</span>
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
                {data.lowStock.length > 0 && (
                  <div className="panel">
                    <div className="panel-head">
                      <h3>Low stock</h3>
                      <div className="right">
                        <Link to="/admin/products" className="btn btn-ghost btn-sm">Manage</Link>
                      </div>
                    </div>
                    <div className="panel-body">
                      {data.lowStock.map((p) => (
                        <div className="stat-line" key={p.id}>
                          <span>{p.name}</span>
                          <b style={{ color: p.stock < 20 ? 'var(--bad)' : 'var(--warn)' }}>{num(p.stock)} left</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel">
                  <div className="panel-head"><h3>Recent Activity</h3></div>
                  <div className="panel-body">
                    {!data.activity.length ? (
                      <Empty icon="bell">Nothing logged yet.</Empty>
                    ) : (
                      <div className="feed">
                        {data.activity.map((a) => (
                          <div className="feed-item" key={a.id}>
                            <span className="feed-ic ic-blue"><Icon name="info" /></span>
                            <span className="feed-txt">
                              {a.message}
                              {a.userName && <span className="cell-sub"> &mdash; {a.userName}</span>}
                            </span>
                            <span className="feed-time">{timeAgo(a.createdAt)}</span>
                          </div>
                        ))}
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
