import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { dateTime, label, statusClass } from '../../utils/format';

export default function AccountSupport() {
  const toast = useToast();
  const { siteName } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', orderId: '' });
  const [busy, setBusy] = useState(false);
  const { toggleSidebar } = useOutletContext();

  const load = () => api.get('/account/support').then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/account/support', form);
      toast.ok('Your ticket was opened. The reply will appear here on this page.');
      setForm({ subject: '', message: '', orderId: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Open a ticket and we will get back to you"
        onToggleSidebar={toggleSidebar}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Icon name="plus" /> New ticket
          </button>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="panel">
          <div className="panel-head">
            <h3>Your tickets</h3>
            {data && <div className="right cell-sub">{data.tickets.length} total</div>}
          </div>
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.tickets.length ? (
              <Empty
                icon="headset"
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                    Open a ticket
                  </button>
                }
              >
                You have not opened any support tickets.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Order</th>
                      <th>Opened</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <span className="cell-main">{t.subject}</span>
                          <span className="cell-sub" style={{ display: 'block' }}>{t.message}</span>
                          {t.reply && (
                            <div className="ticket-reply">
                              <span className="ticket-reply-who">
                                <Icon name="headset" />
                                {siteName} replied{t.repliedAt ? ` · ${dateTime(t.repliedAt)}` : ''}
                              </span>
                              <p>{t.reply}</p>
                            </div>
                          )}
                        </td>
                        <td className="nowrap">{t.orderNumber ? `#${t.orderNumber}` : '-'}</td>
                        <td className="nowrap">{dateTime(t.createdAt)}</td>
                        <td>
                          <span className={`badge ${statusClass(t.status)}`}>{label(t.status)}</span>
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
            <span className="kpi-ic ic-green" style={{ flex: 'none' }}><Icon name="headset" /></span>
            <div>
              <h3 style={{ fontSize: 13, marginBottom: 4 }}>Common questions</h3>
              <p style={{ margin: 0, fontSize: 12 }}>
                A key that says &quot;already in use&quot; usually means it was activated on another device - reply to
                your ticket with the machine name and we will reissue it. Unused keys can be refunded within 14 days.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <Modal
          title="Open a support ticket"
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? 'Sending...' : 'Open ticket'}
              </button>
            </>
          }
        >
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="t-subject">Subject</label>
              <input
                id="t-subject"
                value={form.subject}
                onChange={set('subject')}
                placeholder="Activation code not working"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="t-order">Related order <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
              <select id="t-order" value={form.orderId} onChange={set('orderId')}>
                <option value="">Not about a specific order</option>
                {data?.orders.map((o) => (
                  <option key={o.id} value={o.id}>#{o.orderNumber}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="t-message">What is happening?</label>
              <textarea
                id="t-message"
                value={form.message}
                onChange={set('message')}
                placeholder="Describe the problem, including any error message you see."
                required
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
