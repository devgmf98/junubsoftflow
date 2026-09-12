import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Pager, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { dateTime, timeAgo, label, statusClass, num } from '../../utils/format';

const TABS = [
  ['', 'All'],
  ['new', 'New'],
  ['read', 'Read'],
  ['replied', 'Replied'],
];

/** Contact-form messages and customer support tickets. */
export default function AdminMessages() {
  const { siteName } = useSettings();
  const [ticket, setTicket] = useState(null);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    setData(null);
    const q = new URLSearchParams({ status, page: String(page) });
    api.get(`/admin/messages?${q}`).then(setData).catch((e) => setError(e.message));
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (message) => {
    setViewing(message);
    if (message.status === 'new') {
      try {
        await api.put(`/admin/messages/${message.id}/status`, { status: 'read' });
        load();
      } catch {
        /* marking as read is best-effort */
      }
    }
  };

  const setMessageStatus = async (message, next) => {
    try {
      await api.put(`/admin/messages/${message.id}/status`, { status: next });
      toast.ok('Message updated.');
      setViewing(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const remove = async (message) => {
    if (!window.confirm(`Delete the message from ${message.name}?`)) return;
    try {
      await api.del(`/admin/messages/${message.id}`);
      toast.ok('Message deleted.');
      setViewing(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    setReplying(true);
    try {
      const res = await api.post(`/admin/tickets/${ticket.id}/reply`, { message: reply });
      toast.ok(`Reply sent to ${ticket.userName || 'the customer'}.`);
      setTicket({ ...ticket, reply, repliedAt: new Date().toISOString(), status: res.status });
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setReplying(false);
    }
  };

  const openTicket = (t) => {
    setTicket(t);
    setReply(t.reply || '');
  };

  const setTicketStatus = async (t, next) => {
    try {
      await api.put(`/admin/tickets/${t.id}/status`, { status: next });
      toast.ok('Ticket updated.');
      if (ticket && ticket.id === t.id) setTicket({ ...ticket, status: next });
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Messages & Support"
        subtitle="Enquiries from the contact form and customer tickets"
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
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Contact messages</h3>
            {data && <div className="right cell-sub">{num(data.total)} total</div>}
          </div>
          <div className="panel-body tight">
            {!data ? (
              <Loading />
            ) : !data.messages.length ? (
              <Empty icon="mail">No messages match that filter.</Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>Subject</th>
                        <th>Received</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.messages.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <span className="cell-main">{m.name}</span>
                            <span className="cell-sub" style={{ display: 'block' }}>{m.email}</span>
                          </td>
                          <td>
                            <span className="cell-main">{m.subject || 'No subject'}</span>
                            <span className="cell-sub" style={{ display: 'block' }}>
                              {m.message.slice(0, 70)}
                              {m.message.length > 70 ? '…' : ''}
                            </span>
                          </td>
                          <td className="nowrap">{timeAgo(m.createdAt)}</td>
                          <td>
                            <span className={`badge ${statusClass(m.status)}`}>{label(m.status)}</span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => open(m)} title="Read">
                                <Icon name="eye" />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--bad)' }}
                                onClick={() => remove(m)}
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

        <div className="panel">
          <div className="panel-head">
            <h3>Support tickets</h3>
            {data && <div className="right cell-sub">{data.tickets.length} recent</div>}
          </div>
          <div className="panel-body tight">
            {!data ? null : !data.tickets.length ? (
              <Empty icon="headset">No support tickets yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Subject</th>
                      <th>Order</th>
                      <th>Opened</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <span className="cell-main">{t.userName || 'Deleted user'}</span>
                          <span className="cell-sub" style={{ display: 'block' }}>{t.userEmail}</span>
                        </td>
                        <td>
                          <span className="cell-main">{t.subject}</span>
                          <span className="cell-sub" style={{ display: 'block' }}>
                            {t.message.slice(0, 70)}
                            {t.message.length > 70 ? '…' : ''}
                          </span>
                          {t.reply && (
                            <span className="cell-sub ticket-answered">
                              <Icon name="check" /> Answered {timeAgo(t.repliedAt)}
                            </span>
                          )}
                        </td>
                        <td className="nowrap">{t.orderNumber ? `#${t.orderNumber}` : '-'}</td>
                        <td className="nowrap">{timeAgo(t.createdAt)}</td>
                        <td>
                          <select
                            value={t.status}
                            onChange={(e) => setTicketStatus(t, e.target.value)}
                            className={`badge ${statusClass(t.status)}`}
                            style={{ border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 10.5, padding: '4px 9px' }}
                            aria-label={`Status of ticket ${t.id}`}
                          >
                            <option value="open">Open</option>
                            <option value="pending">Pending</option>
                            <option value="closed">Closed</option>
                          </select>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--blue)' }}
                              onClick={() => openTicket(t)}
                              title={t.reply ? 'Read and edit the reply' : 'Read and reply'}
                            >
                              <Icon name="mail" /> {t.reply ? 'View' : 'Reply'}
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
      </div>

      {viewing && (
        <Modal
          title={viewing.subject || 'Message'}
          onClose={() => setViewing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setViewing(null)}>Close</button>
              <a className="btn btn-outline" href={`mailto:${viewing.email}?subject=Re: ${encodeURIComponent(viewing.subject || '')}`}>
                <Icon name="mail" /> Reply by email
              </a>
              {viewing.status !== 'replied' && (
                <button className="btn btn-primary" onClick={() => setMessageStatus(viewing, 'replied')}>
                  Mark replied
                </button>
              )}
            </>
          }
        >
          <div className="stat-line"><span>From</span><b>{viewing.name}</b></div>
          <div className="stat-line"><span>Email</span><b>{viewing.email}</b></div>
          <div className="stat-line"><span>Received</span><b>{dateTime(viewing.createdAt)}</b></div>
          <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 16, whiteSpace: 'pre-wrap' }}>{viewing.message}</p>
        </Modal>
      )}

      {/* ---------- read and answer a support ticket ---------- */}
      {ticket && (
        <Modal
          title={ticket.subject || 'Support ticket'}
          onClose={() => setTicket(null)}
          footer={
            <>
              <select
                value={ticket.status}
                onChange={(e) => setTicketStatus(ticket, e.target.value)}
                className="ticket-status-select"
                aria-label="Ticket status"
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
              <button className="btn btn-outline" onClick={() => setTicket(null)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={sendReply}
                disabled={replying || !reply.trim()}
              >
                {replying ? 'Sending...' : (<><Icon name="mail" /> {ticket.reply ? 'Update reply' : 'Send reply'}</>)}
              </button>
            </>
          }
        >
          <div className="stat-line"><span>Customer</span><b>{ticket.userName || 'Deleted user'}</b></div>
          <div className="stat-line"><span>Email</span><b>{ticket.userEmail || '-'}</b></div>
          <div className="stat-line"><span>Order</span><b>{ticket.orderNumber ? `#${ticket.orderNumber}` : 'Not linked'}</b></div>
          <div className="stat-line"><span>Opened</span><b>{dateTime(ticket.createdAt)}</b></div>

          <div className="ticket-thread">
            <div className="ticket-bubble from-customer">
              <span className="ticket-who">{ticket.userName || 'Customer'}</span>
              <p>{ticket.message}</p>
            </div>

            {ticket.reply && (
              <div className="ticket-bubble from-us">
                <span className="ticket-who">
                  {siteName}{ticket.repliedBy ? ` - ${ticket.repliedBy}` : ''}
                  {ticket.repliedAt ? ` - ${timeAgo(ticket.repliedAt)}` : ''}
                </span>
                <p>{ticket.reply}</p>
              </div>
            )}
          </div>

          <form onSubmit={sendReply} className="field" style={{ marginTop: 4 }}>
            <label htmlFor="t-reply">{ticket.reply ? 'Edit your reply' : 'Your reply'}</label>
            <textarea
              id="t-reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={5}
              placeholder="Answer the customer. This appears on their Support page."
            />
            <div className="field-hint">
              Sending a reply moves an open ticket to <b>Pending</b> - it is waiting on the customer, not on you.
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
