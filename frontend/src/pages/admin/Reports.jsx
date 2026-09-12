import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { downloadUrl } from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Kpi, BarChart, BarList } from '../../components/ui';
import { money, num, label, statusClass, accentStyle } from '../../utils/format';

/** Admin page 6: reports & analytics. */
export default function AdminReports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    setData(null);
    const q = new URLSearchParams();
    if (applied.from) q.set('from', applied.from);
    if (applied.to) q.set('to', applied.to);
    api.get(`/admin/reports?${q}`).then((d) => {
      setData(d);
      if (!range.from) setRange({ from: d.from, to: d.to });
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  useEffect(() => {
    load();
  }, [load]);

  const exportUrl = () => {
    const q = new URLSearchParams({ export: 'csv' });
    if (applied.from) q.set('from', applied.from);
    if (applied.to) q.set('to', applied.to);
    return downloadUrl(`/admin/reports?${q}`);
  };

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle={data ? `${data.from} to ${data.to}` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={
          <a href={exportUrl()} className="btn btn-outline btn-sm">
            <Icon name="download" /> Export CSV
          </a>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ ...range });
            }}
            style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <label style={{ fontSize: 12, color: 'var(--body)' }}>From</label>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <label style={{ fontSize: 12, color: 'var(--body)' }}>To</label>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            <button type="submit" className="btn btn-primary btn-sm">Apply</button>
          </form>
        </div>

        {!data ? (
          <Loading variant="dashboard" />
        ) : (
          <>
            <div className="kpi-grid k3">
              <Kpi label="Total Revenue" value={money(data.totals.revenue, false)} icon="money" accent="blue" deltaLabel="Paid orders in range" />
              <Kpi label="Total Orders" value={num(data.totals.orders)} icon="inbox" accent="green" deltaLabel="All statuses" />
              <Kpi label="New Customers" value={num(data.totals.customers)} icon="users" accent="purple" deltaLabel="Registered in range" />
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Sales Overview</h3>
                    <div className="sub">Revenue by month</div>
                  </div>
                </div>
                <div className="panel-body">
                  <BarChart series={data.series} money />
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Top Products</h3></div>
                <div className="panel-body">
                  {!data.topProducts.length ? (
                    <Empty icon="box">No sales in this range.</Empty>
                  ) : (
                    <div style={{ display: 'grid', gap: 13 }}>
                      {data.topProducts.map((p) => (
                        <div key={p.name}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span
                              className="kpi-ic"
                              style={{ ...accentStyle(p.accent), width: 28, height: 28, flex: 'none' }}
                            >
                              <Icon name={p.icon} style={{ width: 14, height: 14 }} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                              {p.name}
                              <span className="cell-sub"> · {num(p.units)} sold</span>
                            </span>
                            <b style={{ fontSize: 12, color: 'var(--ink)' }}>{p.share}%</b>
                          </div>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${p.share}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid-2e">
              <div className="panel">
                <div className="panel-head"><h3>Revenue by category</h3></div>
                <div className="panel-body">
                  {!data.byCategory.length ? (
                    <Empty icon="tag">No category data.</Empty>
                  ) : (
                    <BarList
                      rows={data.byCategory.map((c) => ({
                        label: c.name,
                        hint: `${num(c.units)} sold`,
                        value: c.revenue,
                      }))}
                      formatValue={(v) => money(v, false)}
                    />
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Breakdown</h3></div>
                <div className="panel-body">
                  <div
                    style={{
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                      color: 'var(--muted)',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    Payment methods
                  </div>
                  {data.byMethod.length ? (
                    data.byMethod.map((m) => (
                      <div className="stat-line" key={m.method}>
                        <span>{label(m.method)} <span className="cell-sub">({m.count})</span></span>
                        <b>{money(m.total)}</b>
                      </div>
                    ))
                  ) : (
                    <p className="cell-sub">No payments in this range.</p>
                  )}

                  <div
                    style={{
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                      color: 'var(--muted)',
                      fontWeight: 600,
                      margin: '18px 0 8px',
                    }}
                  >
                    Orders by status
                  </div>
                  {data.byStatus.length ? (
                    data.byStatus.map((s) => (
                      <div className="stat-line" key={s.status}>
                        <span className={`badge ${statusClass(s.status)}`}>{label(s.status)}</span>
                        <span>
                          {num(s.count)} · <b>{money(s.total)}</b>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="cell-sub">No orders in this range.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
