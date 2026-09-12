import { useEffect, useState } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty } from '../../components/ui';
import { money, date, dateTime, label, statusClass, accentStyle } from '../../utils/format';

export default function AccountOrderDetail() {
  const { number } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const { toggleSidebar } = useOutletContext();

  useEffect(() => {
    api.get(`/account/orders/${number}`).then(setData).catch((e) => setError(e.message));
  }, [number]);

  const copyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      /* clipboard may be blocked; the key is on screen anyway */
    }
  };

  return (
    <>
      <PageHeader
        title={`Order #${number}`}
        subtitle={data ? dateTime(data.order.createdAt) : undefined}
        onToggleSidebar={toggleSidebar}
        actions={<Link to="/account/orders" className="btn btn-outline btn-sm">Back to orders</Link>}
      />

      <div className="page">
        {error && <Alert type="error">{error}</Alert>}
        {!data ? (
          !error && <Loading variant="panel" />
        ) : (
          <div className="grid-2">
            <div>
              <div className="panel">
                <div className="panel-head">
                  <h3>Items</h3>
                  <div className="right">
                    <span className={`badge ${statusClass(data.order.status)}`}>{label(data.order.status)}</span>
                  </div>
                </div>
                <div className="panel-body tight">
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
                        {data.items.map((i, idx) => (
                          <tr key={idx}>
                            <td>
                              <div className="cell-user">
                                <span
                                  className="kpi-ic"
                                  style={{ ...accentStyle(i.accent), width: 32, height: 32 }}
                                >
                                  <Icon name={i.icon || 'box'} />
                                </span>
                                <span className="cell-main">
                                  {i.slug ? (
                                    <Link to={`/products/${i.slug}`} style={{ color: 'inherit' }}>
                                      {i.productName}
                                    </Link>
                                  ) : (
                                    i.productName
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="num">{money(i.unitPrice)}</td>
                            <td className="num">{i.quantity}</td>
                            <td className="num cell-main">{money(i.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h3>Licence keys</h3>
                  <div className="right cell-sub">{data.licenses.length} issued</div>
                </div>
                <div className="panel-body">
                  {!data.licenses.length ? (
                    <Empty icon="key">
                      Keys are issued once payment clears. We will email you the moment they are ready.
                    </Empty>
                  ) : (
                    <div style={{ display: 'grid', gap: 13 }}>
                      {data.licenses.map((l) => (
                        <div key={l.key}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 5,
                              gap: 10,
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                              {l.productName}
                            </span>
                            <span className={`badge ${statusClass(l.status)}`}>{label(l.status)}</span>
                          </div>
                          <div className="license-key">
                            <span>{l.key}</span>
                            <button onClick={() => copyKey(l.key)}>{copied === l.key ? 'Copied' : 'Copy'}</button>
                          </div>
                          {l.expiresAt && (
                            <div className="cell-sub" style={{ marginTop: 4 }}>
                              Expires {date(l.expiresAt)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="panel">
                <div className="panel-head"><h3>Summary</h3></div>
                <div className="panel-body">
                  <div className="stat-line">
                    <span>Subtotal</span>
                    <b>{money(data.order.subtotal)}</b>
                  </div>
                  {data.order.discount > 0 && (
                    <div className="stat-line">
                      <span>Discount</span>
                      <b style={{ color: '#059669' }}>-{money(data.order.discount)}</b>
                    </div>
                  )}
                  <div className="stat-line">
                    <span>Payment method</span>
                    <b>{label(data.order.paymentMethod)}</b>
                  </div>
                  <div className="stat-line">
                    <span>Payment status</span>
                    <span className={`badge ${statusClass(data.order.paymentStatus)}`}>
                      {label(data.order.paymentStatus)}
                    </span>
                  </div>
                  <div className="stat-line" style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>
                    <span>Total</span>
                    <span>{money(data.order.total)}</span>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Delivered to</h3></div>
                <div className="panel-body">
                  <div className="stat-line"><span>Name</span><b>{data.order.customerName}</b></div>
                  <div className="stat-line"><span>Email</span><b>{data.order.customerEmail}</b></div>
                  {data.order.customerPhone && (
                    <div className="stat-line"><span>Phone</span><b>{data.order.customerPhone}</b></div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-body">
                  <div className="quick-links">
                    <Link to="/account/downloads" className="quick-link">
                      <Icon name="download" /> Downloads
                    </Link>
                    <Link to="/account/support" className="quick-link">
                      <Icon name="headset" /> Get help
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
