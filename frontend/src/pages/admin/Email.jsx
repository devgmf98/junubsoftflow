import { useEffect, useState, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api, { downloadUrl } from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Kpi, Modal, Pager } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { dateTime, timeAgo, num, label, money, offerText } from '../../utils/format';

const STATUS_BADGE = { sent: 'badge-green', failed: 'badge-red', skipped: 'badge-amber' };
const KIND_ICON = { order: 'key', newsletter: 'megaphone', test: 'bolt', other: 'mail' };

const ENV_SAMPLE = [
  'SMTP_HOST=smtp.gmail.com',
  'SMTP_PORT=587',
  'SMTP_USER=you@yourdomain.com',
  'SMTP_PASS=your-app-password',
].join('\n');

/**
 * Everything the store sends out, in one place.
 *
 * The credentials themselves are deliberately not editable here - they are secrets and
 * belong in backend/.env. What an admin controls from this page is who receives mail,
 * what the newsletter says, and whether the connection actually works.
 */
export default function AdminEmail() {
  const toast = useToast();
  const { user } = useAuth();
  const { toggleSidebar } = useOutletContext();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [draft, setDraft] = useState({ subject: '', heading: '', message: '' });
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deal, setDeal] = useState({ subject: '', message: '' });
  const [sendingDeals, setSendingDeals] = useState(false);
  const [busyDeal, setBusyDeal] = useState(null);

  /* the subscriber list is paged and searched on the server, so the panel stays the
     same size whether there are eight addresses or eighty thousand */
  const [subs, setSubs] = useState(null);
  const [subQuery, setSubQuery] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [subPage, setSubPage] = useState(1);

  const load = useCallback(() => {
    api.get('/admin/email').then(setData).catch((e) => setError(e.message));
  }, []);

  const loadSubs = useCallback(() => {
    const q = new URLSearchParams({ page: String(subPage) });
    if (subQuery.trim()) q.set('q', subQuery.trim());
    if (subStatus) q.set('status', subStatus);
    api.get(`/admin/subscribers?${q}`).then(setSubs).catch((e) => setError(e.message));
  }, [subPage, subQuery, subStatus]);

  useEffect(() => {
    // debounced so typing a search does not fire a request per keystroke
    const t = setTimeout(loadSubs, subQuery ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadSubs, subQuery]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user && user.email && !testTo) setTestTo(user.email);
  }, [user, testTo]);

  const configured = Boolean(data && data.smtp && data.smtp.configured);

  const sendTest = async (e) => {
    e.preventDefault();
    setTesting(true);
    try {
      await api.post('/admin/email/test', { to: testTo });
      toast.ok(`Test message sent to ${testTo}. Check the inbox.`);
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setTesting(false);
      load(); // a failure is worth showing in the log too
    }
  };

  const sendNewsletter = async () => {
    setConfirm(false);
    setSending(true);
    try {
      const res = await api.post('/admin/newsletter', draft);
      if (res.failed) {
        toast.fail(`Sent to ${res.sent} of ${res.total} recipients - ${res.failed} failed. See the log below.`);
      } else {
        toast.ok(`Newsletter sent to ${res.sent} recipient${res.sent === 1 ? '' : 's'}.`);
      }
      setDraft({ subject: '', heading: '', message: '' });
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setSending(false);
    }
  };

  const announceDeals = async () => {
    const going = data.deals.filter((d) => d.announce).length;
    if (!window.confirm(`Email ${going} discounted product${going === 1 ? '' : 's'} to ${data.audience.total} recipient${data.audience.total === 1 ? '' : 's'} (subscribers and customers)? This cannot be recalled.`)) return;
    setSendingDeals(true);
    try {
      const res = await api.post('/admin/newsletter/deals', deal);
      if (res.failed) {
        toast.fail(`Sent to ${res.sent} of ${res.total} - ${res.failed} failed. See the log below.`);
      } else {
        toast.ok(`${res.deals} deal${res.deals === 1 ? '' : 's'} announced to ${res.sent} recipient${res.sent === 1 ? '' : 's'}.`);
      }
      setDeal({ subject: '', message: '' });
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setSendingDeals(false);
    }
  };

  /**
   * Include or exclude one discount from the announcement, without leaving this page.
   * PUT /admin/products/:id only writes the keys it is given, so this cannot disturb
   * the price, the stock or anything else on the product.
   */
  const toggleAnnounce = async (deal) => {
    setBusyDeal(deal.id);
    try {
      await api.put(`/admin/products/${deal.id}`, { announceDiscount: !deal.announce });
      toast.ok(
        deal.announce
          ? `${deal.name} will be left out of the deals email.`
          : `${deal.name} will be included in the deals email.`
      );
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusyDeal(null);
    }
  };

  const toggle = async (sub) => {
    try {
      await api.put(`/admin/subscribers/${sub.id}`, { isActive: !sub.isActive });
      toast.ok(sub.isActive ? `${sub.email} will no longer be emailed.` : `${sub.email} is subscribed again.`);
      load();
      loadSubs();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const remove = async (sub) => {
    if (!window.confirm(`Remove ${sub.email} from the list? This cannot be undone.`)) return;
    try {
      await api.del(`/admin/subscribers/${sub.id}`);
      toast.ok(`${sub.email} was removed.`);
      load();
      loadSubs();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  // only the ticked ones go out; the rest stay live on the store but stay quiet
  const announceable = data ? data.deals.filter((d) => d.announce) : [];

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const ready = draft.subject.trim() && draft.message.trim();

  return (
    <>
      <PageHeader
        title="Email &amp; Newsletter"
        subtitle="What the store sends, who receives it, and whether it arrived"
        onToggleSidebar={toggleSidebar}
        actions={
          data && data.subscribers.length > 0 && (
            <a className="btn btn-outline btn-sm" href={downloadUrl('/admin/subscribers/export')}>
              <Icon name="download" /> Export CSV
            </a>
          )
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          !error && <Loading variant="dashboard" />
        ) : (
          <>
            <div className="kpi-grid">
              <Kpi
                label="Announcement reach"
                value={num(data.audience.total)}
                icon="users"
                accent="blue"
                deltaLabel={`${num(data.audience.subscribers)} subscribed · ${num(data.audience.customers)} customers`}
              />
              <Kpi label="Delivered" value={num(data.tally.sent)} icon="check" accent="green" deltaLabel="Reached an inbox" />
              <Kpi label="Failed" value={num(data.tally.failed)} icon="alert" accent="orange" deltaLabel="Rejected by the server" />
              <Kpi
                label="Not sent"
                value={num(data.tally.skipped)}
                icon="clock"
                accent="purple"
                deltaLabel={configured ? 'Skipped before setup' : 'No mail server set up'}
              />
            </div>

            {/* ---------- is there anywhere to send from? ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Delivery</h3>
                <div className="right">
                  <span className={`badge ${configured ? 'badge-green' : 'badge-amber'}`}>
                    {configured ? 'Connected' : 'Not configured'}
                  </span>
                </div>
              </div>

              <div className="panel-body">
                {!configured ? (
                  <div className="mail-setup">
                    <span className="kpi-ic ic-orange"><Icon name="alert" /></span>
                    <div className="mail-setup-body">
                      <b>Nothing is being emailed yet.</b>
                      <p>
                        Orders are still paid and licence keys are still issued - they simply are not
                        delivered by email. Add a mail server to <code>backend/.env</code> and restart
                        the API:
                      </p>
                      <pre className="mail-env">{ENV_SAMPLE}</pre>
                      <p className="mail-note">
                        With Gmail this must be an <b>App Password</b>, not the account password. The
                        credentials stay out of the database because they are secrets; the from-name
                        and reply-to address are yours to edit under{' '}
                        <Link to="/admin/settings">Settings &rarr; Email</Link>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mail-conn">
                      <div className="stat-line"><span>Server</span><b>{data.smtp.host}:{data.smtp.port}</b></div>
                      <div className="stat-line"><span>Encryption</span><b>{data.smtp.secure ? 'TLS (implicit)' : 'STARTTLS'}</b></div>
                      <div className="stat-line"><span>Signed in as</span><b>{data.smtp.user || 'No authentication'}</b></div>
                      <div className="stat-line">
                        <span>Public address</span>
                        <b>{data.smtp.publicUrl || 'Not set'}</b>
                      </div>
                    </div>

                    {/* links work, but only on this machine - say so rather than let it surprise anyone */}
                    {data.smtp.publicUrl && data.smtp.publicUrlIsPrivate && (
                      <div className="mail-warn">
                        <span className="kpi-ic ic-orange"><Icon name="alert" /></span>
                        <div className="mail-setup-body">
                          <b>Links point at a private address.</b>
                          <p>
                            <code>{data.smtp.publicUrl}</code> only resolves on this machine, so the
                            store name, the catalogue button and the unsubscribe link work for you
                            and for nobody else. Spam filters read a link like this as phishing, so
                            expect messages to be filed as spam. Fine for testing - swap it for the
                            live domain under <Link to="/admin/settings">Settings &rarr; General</Link>{' '}
                            before real customers get mail.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* the usual reason a message that sent fine still landed in spam */}
                    {!data.smtp.publicUrl && (
                      <div className="mail-warn">
                        <span className="kpi-ic ic-orange"><Icon name="alert" /></span>
                        <div className="mail-setup-body">
                          <b>Emails are being sent without any links.</b>
                          <p>
                            A link pointing at <code>localhost</code> or a domain that does not
                            resolve is the shape of phishing, and spam filters score it as such - so
                            the buttons are left out rather than shipped broken. Set{' '}
                            <code>PUBLIC_URL</code> in <code>backend/.env</code> to the store&rsquo;s
                            live <code>https://</code> address and the &ldquo;Open your
                            licences&rdquo; button, the catalogue link and one-click unsubscribe all
                            come back on their own.
                          </p>
                        </div>
                      </div>
                    )}

                    <form onSubmit={sendTest} className="field-row mail-test">
                      <div className="field">
                        <label htmlFor="m-test">Send a test message to</label>
                        <input
                          id="m-test"
                          type="email"
                          value={testTo}
                          onChange={(e) => setTestTo(e.target.value)}
                          placeholder="you@company.com"
                          required
                        />
                      </div>
                      <button type="submit" className="btn btn-outline" disabled={testing}>
                        {testing ? 'Sending...' : (<><Icon name="send" /> Send test</>)}
                      </button>
                    </form>
                    <div className="field-hint">
                      A real message through the real settings - if it arrives, receipts and
                      newsletters will too.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ---------- announce whatever is discounted ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Discounted products</h3>
                <div className="right cell-sub">
                  {data.deals.length
                    ? `${num(announceable.length)} of ${num(data.deals.length)} will be announced`
                    : 'Nothing discounted'}
                </div>
              </div>
              <div className="panel-body">
                {!data.deals.length ? (
                  <Empty icon="tag">
                    No product carries a discount. Set one on a product under{' '}
                    <Link to="/admin/products">Products</Link> and it appears here, on the storefront,
                    and in the announcement below.
                  </Empty>
                ) : (
                  <>
                    <div className="field-hint" style={{ marginBottom: 10 }}>
                      Tick the ones to announce. Unticking leaves the discount live on the
                      storefront and only keeps it out of the email.
                    </div>
                    <div className="deal-list">
                      {data.deals.map((d) => (
                        <div className={`deal-row ${d.announce ? '' : 'is-quiet'}`} key={d.slug}>
                          {/* tick to include this one in the announcement; the discount
                              stays live on the storefront either way */}
                          <label
                            className="deal-check"
                            title={
                              d.announce
                                ? 'Included in the deals email - untick to leave it out'
                                : 'Left out of the deals email - tick to include it'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={d.announce}
                              disabled={busyDeal === d.id}
                              onChange={() => toggleAnnounce(d)}
                            />
                          </label>
                          <span className="badge badge-green">{offerText(d.percent, d.label)}</span>
                          <span className="deal-name">{d.name}</span>
                          {!d.announce && <span className="deal-quiet-tag">not announced</span>}
                          <span className="deal-was">{money(d.was)}</span>
                          <b className="deal-now">{money(d.now)}</b>
                        </div>
                      ))}
                    </div>

                    <div className="field" style={{ marginTop: 16 }}>
                      <label htmlFor="d-subject">
                        Subject <span className="cell-sub">(optional)</span>
                      </label>
                      <input
                        id="d-subject"
                        value={deal.subject}
                        onChange={(e) => setDeal((d) => ({ ...d, subject: e.target.value }))}
                        placeholder={
                          announceable.length
                            ? `Up to ${Math.max(...announceable.map((d) => d.percent))}% off`
                            : 'Up to 25% off'
                        }
                        maxLength={160}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="d-message">
                        Opening line <span className="cell-sub">(optional)</span>
                      </label>
                      <textarea
                        id="d-message"
                        rows={2}
                        value={deal.message}
                        onChange={(e) => setDeal((d) => ({ ...d, message: e.target.value }))}
                        placeholder="Defaults to a line naming how many titles are discounted."
                      />
                      <div className="field-hint">
                        The product list, prices and percentages are read from the catalogue when the
                        message is sent, so the email cannot advertise a discount that is not loaded.
                      </div>
                    </div>

                    <button
                      className="btn btn-primary btn-block"
                      disabled={sendingDeals || !configured || !data.audience.total || !announceable.length}
                      onClick={announceDeals}
                    >
                      {sendingDeals ? 'Sending...' : (
                        <>
                          <Icon name="tag" /> Announce {num(announceable.length)} deal
                          {announceable.length === 1 ? '' : 's'} to {num(data.audience.total)} recipient
                          {data.audience.total === 1 ? '' : 's'}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid-2">
              {/* ---------- write the newsletter ---------- */}
              <div className="panel">
                <div className="panel-head">
                  <h3>Write a newsletter</h3>
                  <div className="right cell-sub">
                    {num(data.audience.total)} recipient{data.audience.total === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="panel-body">
                  <div className="field">
                    <label htmlFor="n-subject">Subject</label>
                    <input
                      id="n-subject"
                      value={draft.subject}
                      onChange={set('subject')}
                      placeholder="New release: MoneyPay 2.1 is out"
                      maxLength={160}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="n-heading">
                      Heading <span className="cell-sub">(optional)</span>
                    </label>
                    <input
                      id="n-heading"
                      value={draft.heading}
                      onChange={set('heading')}
                      placeholder="Defaults to the subject"
                      maxLength={160}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="n-message">Message</label>
                    <textarea
                      id="n-message"
                      value={draft.message}
                      onChange={set('message')}
                      rows={7}
                      placeholder="Say what changed and why it matters. Line breaks are kept."
                    />
                    <div className="field-hint">
                      Plain text - it is wrapped in the store&rsquo;s layout, with a link to the
                      catalogue and an unsubscribe note.
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-block"
                    disabled={!ready || sending || !configured || !data.audience.total}
                    onClick={() => setConfirm(true)}
                  >
                    {sending ? 'Sending...' : (
                      <>
                        <Icon name="megaphone" /> Send to {num(data.audience.total)} recipient
                        {data.audience.total === 1 ? '' : 's'}
                      </>
                    )}
                  </button>

                  {!configured && (
                    <p className="field-hint mail-blocked">
                      <Icon name="lock" /> Set up delivery above before this can be sent.
                    </p>
                  )}
                  {configured && !data.audience.total && (
                    <p className="field-hint mail-blocked">
                      Nobody is subscribed and no customer has an account, so there is no one to
                      send to.
                    </p>
                  )}
                  {data.audience.total > 0 && (
                    <p className="field-hint" style={{ marginTop: 10 }}>
                      Goes to {num(data.audience.subscribers)} newsletter subscriber
                      {data.audience.subscribers === 1 ? '' : 's'} and {num(data.audience.customers)}{' '}
                      registered customer{data.audience.customers === 1 ? '' : 's'}. Anyone who
                      unsubscribed is left out, account or not.
                    </p>
                  )}
                </div>
              </div>

              {/* ---------- who is on the list ---------- */}
              <div className="panel">
                <div className="panel-head">
                  <h3>Subscribers</h3>
                  <div className="right cell-sub">{num(data.subscriberTotal)} total</div>
                </div>

                {/* search and filter rather than an ever-growing list */}
                <div className="subs-tools">
                  <div className="subs-search">
                    <Icon name="search" />
                    <input
                      value={subQuery}
                      onChange={(e) => {
                        setSubQuery(e.target.value);
                        setSubPage(1);
                      }}
                      placeholder="Search an address"
                      aria-label="Search subscribers"
                    />
                    {subQuery && (
                      <button
                        type="button"
                        className="subs-clear"
                        onClick={() => {
                          setSubQuery('');
                          setSubPage(1);
                        }}
                        aria-label="Clear search"
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                  <div className="pill-tabs">
                    {[['', 'All'], ['active', 'Subscribed'], ['paused', 'Paused']].map(([v, t]) => (
                      <button
                        key={v || 'all'}
                        className={`pill-tab ${subStatus === v ? 'on' : ''}`}
                        onClick={() => {
                          setSubStatus(v);
                          setSubPage(1);
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel-body tight">
                  {!subs ? (
                    <Loading variant="table" rows={4} />
                  ) : !subs.subscribers.length ? (
                    <Empty icon="mail">
                      {subQuery || subStatus
                        ? 'No address matches that filter.'
                        : 'No one has subscribed yet. The sign-up form sits in the store footer.'}
                    </Empty>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Email</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subs.subscribers.map((sub) => (
                              <tr key={sub.id}>
                                <td>
                                  <span className="cell-main">{sub.email}</span>
                                  <span className="cell-sub" style={{ display: 'block' }}>
                                    Subscribed {timeAgo(sub.createdAt)}
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${sub.isActive ? 'badge-green' : 'badge-gray'}`}>
                                    {sub.isActive ? 'Subscribed' : 'Paused'}
                                  </span>
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => toggle(sub)}
                                      title={sub.isActive ? 'Stop emailing this address' : 'Subscribe again'}
                                    >
                                      <Icon name={sub.isActive ? 'minus' : 'check'} />
                                    </button>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ color: 'var(--bad)' }}
                                      onClick={() => remove(sub)}
                                      title="Remove from the list"
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
                      <Pager
                        page={subs.page}
                        pages={subs.pages}
                        total={subs.total}
                        perPage={subs.perPage}
                        onPage={setSubPage}
                        // half-width panel: numbered buttons stop fitting past ~9 pages
                        compact={subs.pages > 9}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ---------- what actually went out ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Delivery log</h3>
                <div className="right cell-sub">
                  {data.log.length ? `Last ${data.log.length} attempts` : 'Nothing yet'}
                </div>
              </div>
              <div className="panel-body tight">
                {!data.log.length ? (
                  <Empty icon="inbox">
                    Nothing has been sent yet. Every attempt - delivered, failed or skipped - is
                    recorded here.
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    {/* denser than the other admin tables: this is a log, read in bulk */}
                    <table className="data log-table">
                      <thead>
                        <tr>
                          <th>To</th>
                          <th>Subject</th>
                          <th>Type</th>
                          <th>When</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.log.map((l) => (
                          <tr key={l.id}>
                            <td><span className="cell-main">{l.recipient}</span></td>
                            <td>
                              <span className="cell-main">{l.subject}</span>
                              {l.error && <span className="cell-sub mail-err">{l.error}</span>}
                            </td>
                            <td className="nowrap">
                              <span className="badge badge-gray plain">
                                <Icon name={KIND_ICON[l.kind] || 'mail'} /> {label(l.kind)}
                              </span>
                            </td>
                            <td className="nowrap cell-sub" title={dateTime(l.createdAt)}>
                              {timeAgo(l.createdAt)}
                            </td>
                            <td>
                              <span className={`badge ${STATUS_BADGE[l.status] || 'badge-gray'}`}>
                                {label(l.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {confirm && (
        <Modal
          title="Send this newsletter?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={sendNewsletter}>
                <Icon name="send" /> Send it
              </button>
            </>
          }
        >
          <div className="stat-line">
            <span>Recipients</span>
            <b>
              {num(data.audience.total)} - {num(data.audience.subscribers)} subscribed,{' '}
              {num(data.audience.customers)} customers
            </b>
          </div>
          <div className="stat-line"><span>Subject</span><b>{draft.subject}</b></div>
          <div className="stat-line">
            <span>From</span><b>{data.smtp.user || 'the configured address'}</b>
          </div>
          <p className="modal-note">
            This goes out immediately and cannot be recalled. Messages are sent one at a time, so a
            large list takes a moment.
          </p>
        </Modal>
      )}
    </>
  );
}
