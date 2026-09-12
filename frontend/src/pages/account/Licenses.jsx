import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty } from '../../components/ui';
import { date, label, statusClass, accentStyle } from '../../utils/format';

/** Delivery & licences - every key issued to this account. */
export default function AccountLicenses() {
  const [licenses, setLicenses] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const { toggleSidebar } = useOutletContext();

  useEffect(() => {
    api.get('/account/licenses').then((d) => setLicenses(d.licenses)).catch((e) => setError(e.message));
  }, []);

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
        title="Delivery & Licences"
        subtitle={licenses ? `${licenses.length} licence key${licenses.length === 1 ? '' : 's'}` : undefined}
        onToggleSidebar={toggleSidebar}
        actions={<Link to="/account/downloads" className="btn btn-outline btn-sm">
          <Icon name="download" /> Downloads
        </Link>}
      />

      <div className="page">
        {error && <Alert type="error">{error}</Alert>}

        {!licenses ? (
          <Loading />
        ) : !licenses.length ? (
          <div className="panel">
            <div className="panel-body">
              <Empty
                icon="key"
                action={<Link to="/products" className="btn btn-primary btn-sm">Browse products</Link>}
              >
                No licences yet. Buy a product and its key appears here immediately.
              </Empty>
            </div>
          </div>
        ) : (
          <div className="product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
            {licenses.map((l) => (
              <div className="panel" key={l.id} style={{ margin: 0 }}>
                <div className="panel-head">
                  <span className="kpi-ic" style={{ ...accentStyle(l.accent), flex: 'none' }}>
                    <Icon name={l.icon || 'box'} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3>{l.productName || 'Product removed'}</h3>
                    <div className="sub">
                      {l.licenceTerm || 'Licence'}
                      {l.orderNumber && ` · #${l.orderNumber}`}
                    </div>
                  </div>
                  <div className="right">
                    <span className={`badge ${statusClass(l.status)}`}>{label(l.status)}</span>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="license-key">
                    <span>{l.key}</span>
                    <button onClick={() => copyKey(l.key)}>{copied === l.key ? 'Copied' : 'Copy'}</button>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 10,
                      fontSize: 11,
                      color: 'var(--muted)',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>Issued {date(l.issuedAt)}</span>
                    {l.expiresAt && <span>Expires {date(l.expiresAt)}</span>}
                  </div>

                  {l.productSlug && (
                    <Link
                      to={`/products/${l.productSlug}`}
                      className="btn btn-outline btn-sm btn-block"
                      style={{ marginTop: 12 }}
                    >
                      View product
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
