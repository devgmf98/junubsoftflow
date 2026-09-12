import { useEffect, useState, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Avatar, Modal } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { date, dateTime, label, statusClass, PAYMENT_METHODS } from '../../utils/format';

const TABS = [
  ['general', 'General', 'settings'],
  ['payment', 'Payment', 'card'],
  ['email', 'Email', 'mail'],
  ['users', 'Users', 'users'],
  ['api', 'API', 'code'],
];

const GENERAL_FIELDS = [
  ['site_name', 'Site name', 'SoftFlow'],
  [
    'site_url',
    'Website address',
    'https://your-store.com',
    'Where emails link back to. Until this is a real public address, messages are sent '
      + 'without links - one pointing at localhost would send them straight to spam.',
  ],
  ['site_tagline', 'Tagline', 'Software for a smarter tomorrow'],
  ['support_email', 'Support email', 'support@softflow.com'],
  ['support_phone', 'Support phone', '+211 920 000 111'],
  ['office_address', 'Office address', 'Juba, South Sudan'],
  ['timezone', 'Time zone', '(UTC+3) Nairobi'],
  ['currency', 'Currency', 'USD'],
];

const HERO_FIELDS = [
  ['hero_title', 'Hero title'],
  ['hero_subtitle', 'Hero subtitle'],
  ['hero_banner', 'Banner headline'],
  ['hero_banner_sub', 'Banner subtext'],
];

const PAYMENT_TOGGLES = PAYMENT_METHODS.map((m) => [m.settingKey, m.label, m.hint]);

/** Admin page 7: settings, with the tabbed sections from the reference. */
export default function AdminSettings() {
  const BLANK_USER = {
    name: '', email: '', password: '', role: 'admin', roleId: '',
    phone: '', company: '', status: 'active',
  };
  const [newUser, setNewUser] = useState(null);
  const toast = useToast();
  const { reload: reloadSettings } = useSettings();
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [tab, setTab] = useState('general');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api
      .get('/admin/settings')
      .then((d) => {
        setData(d);
        setValues(d.settings);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* licence_terms is stored one per line; the UI edits it as a list of rows */
  const terms = (values.licence_terms ?? '').split('\n');
  const termRows = terms.length ? terms : [''];
  const writeTerms = (list) => setValues((v) => ({ ...v, licence_terms: list.join('\n') }));
  const setTerm = (i, text) => writeTerms(termRows.map((t, n) => (n === i ? text : t)));
  const addTerm = () => writeTerms([...termRows, '']);
  const dropTerm = (i) => writeTerms(termRows.filter((_, n) => n !== i));

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
  };

  /**
   * Save one panel on its own.
   *
   * `keys` narrows the write to that panel's own fields - the server only touches
   * keys present in the body, so saving Licence terms cannot revert an unsaved edit
   * sitting in Storefront copy. Omit it to save the whole group.
   */
  const createUser = async (e) => {
    e.preventDefault();
    setBusy('new-user');
    try {
      const res = await api.post('/admin/users', newUser);
      toast.ok(`${res.user.name} was added as ${res.user.role === 'admin' ? 'an administrator' : 'a customer'}.`);
      setNewUser(null);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy('');
    }
  };

  const saveGroup = async (group, { keys, panel, message } = {}) => {
    const tag = panel || group;
    setBusy(tag);
    setError('');
    try {
      const fields = keys || data.groups[group] || [];
      const payload = {};
      fields.forEach((k) => {
        payload[k] = values[k] ?? '';
      });
      await api.put(`/admin/settings/${group}`, payload);
      // the header, sidebar and tab read the store name from settings, so refresh the
      // shared copy rather than making the admin reload to see their own rename
      if (group === 'general') await reloadSettings();
      toast.ok(message || 'Settings saved.');
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.put('/auth/password', pw);
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.ok('Your password has been changed.');
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Store configuration" onToggleSidebar={toggleSidebar} />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          <Loading variant="panel" />
        ) : (
          <div className="shop-layout">
            <aside>
              <div className="panel">
                <div className="panel-body" style={{ padding: 10 }}>
                  <div className="filter-side">
                    {TABS.map(([key, text, icon]) => (
                      <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
                        <Icon name={icon} />
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <div>
              {/* ---------- general ---------- */}
              {tab === 'general' && (
                <>
                  <div className="panel">
                    <div className="panel-head">
                      <h3>General Settings</h3>
                      <div className="right">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            saveGroup('general', {
                              keys: GENERAL_FIELDS.map(([k]) => k),
                              panel: 'general-fields',
                              message: 'General settings saved.',
                            })
                          }
                          disabled={busy === 'general-fields'}
                        >
                          {busy === 'general-fields' ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                    <div className="panel-body">
                      {GENERAL_FIELDS.map(([key, text, placeholder, hint]) => (
                        <div className="field" key={key}>
                          <label htmlFor={`g-${key}`}>{text}</label>
                          <input
                            id={`g-${key}`}
                            value={values[key] || ''}
                            onChange={set(key)}
                            placeholder={placeholder}
                          />
                          {hint && <div className="field-hint">{hint}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head">
                      <h3>Licence terms</h3>
                      <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="cell-sub">
                          {termRows.filter(Boolean).length} option
                          {termRows.filter(Boolean).length === 1 ? '' : 's'}
                        </span>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            saveGroup('general', {
                              keys: ['licence_terms'],
                              panel: 'terms',
                              message: 'Licence terms saved.',
                            })
                          }
                          disabled={busy === 'terms'}
                        >
                          {busy === 'terms' ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                    <div className="panel-body">
                      <p className="field-hint" style={{ marginBottom: 12 }}>
                        These are the choices in the <b>Licence term</b> dropdown when you add or edit a
                        product. Order here is the order shown there.
                      </p>

                      <div className="term-list">
                        {termRows.map((t, i) => (
                          <div className="term-row" key={i}>
                            <span className="term-n">{i + 1}</span>
                            <input
                              value={t}
                              onChange={(e) => setTerm(i, e.target.value)}
                              placeholder="e.g. 1 Year Subscription"
                              aria-label={`Licence term ${i + 1}`}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--bad)' }}
                              onClick={() => dropTerm(i)}
                              title="Remove"
                              disabled={termRows.length === 1}
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={addTerm}>
                          <Icon name="plus" /> Add term
                        </button>
                      </div>

                      <p className="field-hint" style={{ marginTop: 12 }}>
                        <Icon name="info" style={{ width: 12, display: 'inline', verticalAlign: -1 }} /> Removing a
                        term here does not change products already using it - that product keeps its term until you
                        edit it.
                      </p>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head">
                      <h3>Storefront copy</h3>
                      <div className="right">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            saveGroup('general', {
                              keys: HERO_FIELDS.map(([k]) => k),
                              panel: 'hero',
                              message: 'Storefront copy saved.',
                            })
                          }
                          disabled={busy === 'hero'}
                        >
                          {busy === 'hero' ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                    <div className="panel-body">
                      {HERO_FIELDS.map(([key, text]) => (
                        <div className="field" key={key}>
                          <label htmlFor={`h-${key}`}>{text}</label>
                          <input id={`h-${key}`} value={values[key] || ''} onChange={set(key)} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ---------- payment ---------- */}
              {tab === 'payment' && (
                <div className="panel">
                  <div className="panel-head">
                    <h3>Payment Settings</h3>
                    <div className="right">
                      <button className="btn btn-primary btn-sm" onClick={() => saveGroup('payment')} disabled={busy === 'payment'}>
                        {busy === 'payment' ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div
                      style={{
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        letterSpacing: '.05em',
                        color: 'var(--muted)',
                        fontWeight: 600,
                        marginBottom: 12,
                      }}
                    >
                      Accepted methods
                    </div>
                    <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
                      {PAYMENT_TOGGLES.map(([key, text, hint]) => (
                        <label key={key} className={`pay-option ${values[key] !== '0' ? 'on' : ''}`}>
                          <input type="checkbox" checked={values[key] !== '0'} onChange={set(key)} />
                          <span>
                            <span className="lbl">{text}</span>
                            {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="field-hint" style={{ marginTop: -12, marginBottom: 22 }}>
                      Bank transfer and cash orders stay pending until you confirm the money arrived - marking the
                      order completed then issues the licence keys.
                    </p>

                    <div className="field">
                      <label htmlFor="p-disc">Default checkout discount (%)</label>
                      <input
                        id="p-disc"
                        type="number"
                        min="0"
                        max="90"
                        value={values.checkout_discount || '0'}
                        onChange={set('checkout_discount')}
                      />
                      <div className="field-hint">
                        Used by any method without a rate of its own. Set to 0 to turn the discount off.
                      </div>
                    </div>

                    <div className="form-section" style={{ marginTop: 18 }}>
                      <div className="form-section-head">
                        <Icon name="money" /> Per-method discount
                        <span className="cell-sub">Leave blank to use the default above</span>
                      </div>

                      <p className="field-hint" style={{ marginBottom: 12 }}>
                        Card and PayPal cost you processing fees; mobile money and cash do not. Setting a rate
                        here lets you pass that difference on rather than discounting every method the same.
                      </p>

                      <div className="disc-rows">
                        {PAYMENT_TOGGLES.map(([toggleKey, text]) => {
                          const method = toggleKey.replace('payment_', '');
                          const key = `discount_${method}`;
                          const raw = values[key];
                          const blank = raw === undefined || String(raw).trim() === '';
                          const effective = blank ? Number(values.checkout_discount || 0) : Number(raw || 0);
                          const off = values[toggleKey] === '0';
                          return (
                            <div className={`disc-row ${off ? 'off' : ''}`} key={key}>
                              <span className="disc-name">
                                {text}
                                {off && <em>not accepted</em>}
                              </span>
                              <span className="disc-input">
                                <input
                                  type="number"
                                  min="0"
                                  max="90"
                                  placeholder={String(values.checkout_discount || 0)}
                                  value={blank ? '' : raw}
                                  onChange={set(key)}
                                  aria-label={`${text} discount percent`}
                                />
                                <span className="disc-pct">%</span>
                              </span>
                              <span className="disc-eff">
                                {blank ? `default · ${effective}%` : `${effective}% applied`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------- email ---------- */}
              {tab === 'email' && (
                <div className="panel">
                  <div className="panel-head">
                    <h3>Email Settings</h3>
                    <div className="right">
                      <button className="btn btn-primary btn-sm" onClick={() => saveGroup('email')} disabled={busy === 'email'}>
                        {busy === 'email' ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="field">
                      <label htmlFor="e-name">From name</label>
                      <input id="e-name" value={values.email_from_name || ''} onChange={set('email_from_name')} />
                    </div>
                    <div className="field">
                      <label htmlFor="e-addr">From address</label>
                      <input id="e-addr" value={values.email_from_address || ''} onChange={set('email_from_address')} />
                    </div>
                    <label className="field-check">
                      <input
                        type="checkbox"
                        checked={values.email_order_confirmation !== '0'}
                        onChange={set('email_order_confirmation')}
                      />
                      Send an order confirmation with licence keys after every purchase
                    </label>
                    <p className="field-hint" style={{ marginTop: 12 }}>
                      The mail server itself is configured in <code>backend/.env</code>, not here -
                      the password is a secret. See the connection, send a test and read the
                      delivery log under <Link to="/admin/email">Email &amp; Newsletter</Link>.
                    </p>
                  </div>
                </div>
              )}

              {/* ---------- users ---------- */}
              {tab === 'users' && (
                <>
                  <div className="panel">
                    <div className="panel-head">
                      <h3>Administrators</h3>
                      <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="cell-sub">{data.admins.length} account(s)</span>
                        <button className="btn btn-primary btn-sm" onClick={() => setNewUser({ ...BLANK_USER })}>
                          <Icon name="plus" /> Add user
                        </button>
                      </div>
                    </div>
                    <div className="panel-body tight">
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Last sign-in</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.admins.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <div className="cell-user">
                                    <Avatar name={a.name} email={a.email} size="sm" />
                                    <span className="cell-main">{a.name}</span>
                                  </div>
                                </td>
                                <td>{a.email}</td>
                                <td className="nowrap">
                                  {a.roleName ? (
                                    <span className="badge badge-gray plain">{a.roleName}</span>
                                  ) : (
                                    <span className="cell-sub">Not assigned</span>
                                  )}
                                </td>
                                <td className="nowrap">{a.lastLoginAt ? dateTime(a.lastLoginAt) : 'Never'}</td>
                                <td>
                                  <span className={`badge ${statusClass(a.status)}`}>{label(a.status)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head"><h3>Change your password</h3></div>
                    <div className="panel-body">
                      <form onSubmit={savePassword}>
                        <div className="field">
                          <label htmlFor="ap-cur">Current password</label>
                          <input
                            id="ap-cur"
                            type="password"
                            value={pw.currentPassword}
                            onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
                            autoComplete="current-password"
                            required
                          />
                        </div>
                        <div className="field-row">
                          <div className="field">
                            <label htmlFor="ap-new">New password</label>
                            <input
                              id="ap-new"
                              type="password"
                              value={pw.newPassword}
                              onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
                              autoComplete="new-password"
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="ap-con">Confirm</label>
                            <input
                              id="ap-con"
                              type="password"
                              value={pw.confirmPassword}
                              onChange={(e) => setPw((p) => ({ ...p, confirmPassword: e.target.value }))}
                              autoComplete="new-password"
                              required
                            />
                          </div>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={busy === 'password'}>
                          {busy === 'password' ? 'Saving...' : 'Change password'}
                        </button>
                      </form>
                    </div>
                  </div>
                </>
              )}

              {/* ---------- api ---------- */}
              {tab === 'api' && (
                <div className="panel">
                  <div className="panel-head"><h3>API</h3></div>
                  <div className="panel-body">
                    <p style={{ fontSize: 12.5 }}>
                      The storefront and admin console both talk to the SoftFlow REST API. These are the endpoints the
                      React app uses:
                    </p>
                    <div style={{ display: 'grid', gap: 6, fontSize: 11.5 }}>
                      {[
                        ['GET', '/api/shop/products', 'Catalogue listing with search, category and sort'],
                        ['GET', '/api/shop/products/:slug', 'Product detail, features and reviews'],
                        ['POST', '/api/shop/cart/price', 'Server-side cart re-pricing'],
                        ['POST', '/api/shop/checkout', 'Place an order and issue licence keys'],
                        ['GET', '/api/account/licenses', 'Licence keys for the signed-in customer'],
                        ['GET', '/api/admin/dashboard', 'Store KPIs and revenue series'],
                        ['POST', '/api/admin/demos/:id/apk', 'Upload an Android build'],
                      ].map(([method, path, desc]) => (
                        <div
                          key={path}
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'baseline',
                            padding: '8px 0',
                            borderBottom: '1px solid var(--line-2)',
                          }}
                        >
                          <span
                            className="badge badge-blue plain"
                            style={{ fontFamily: 'monospace', minWidth: 46, justifyContent: 'center' }}
                          >
                            {method}
                          </span>
                          <code style={{ color: 'var(--ink)', fontSize: 11 }}>{path}</code>
                          <span className="cell-sub" style={{ marginLeft: 'auto', textAlign: 'right' }}>{desc}</span>
                        </div>
                      ))}
                    </div>
                    <p className="field-hint" style={{ marginTop: 14 }}>
                      All requests carry the session cookie. Admin endpoints additionally require an administrator
                      account.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------- add a user, including another admin ---------- */}
      {newUser && (
        <Modal
          title="Add a user"
          onClose={() => setNewUser(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setNewUser(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={createUser} disabled={busy === 'new-user'}>
                {busy === 'new-user' ? 'Creating...' : (<><Icon name="plus" /> Create user</>)}
              </button>
            </>
          }
        >
          <form onSubmit={createUser}>
            <div className="field">
              <label>Role</label>
              <div className="kind-picker">
                <button
                  type="button"
                  className={`kind-option ${newUser.role === 'admin' ? 'on' : ''}`}
                  onClick={() => setNewUser((u) => ({ ...u, role: 'admin' }))}
                >
                  <Icon name="lock" /> Administrator
                </button>
                <button
                  type="button"
                  className={`kind-option ${newUser.role === 'customer' ? 'on' : ''}`}
                  onClick={() => setNewUser((u) => ({ ...u, role: 'customer' }))}
                >
                  <Icon name="user" /> Customer
                </button>
              </div>
              <div className="field-hint">
                {newUser.role === 'admin'
                  ? 'Full access to this console, including orders, files and other users.'
                  : 'Can buy, download what they own and open support tickets.'}
              </div>
            </div>

            {newUser.role === 'admin' && (
              <div className="field">
                <label htmlFor="nu-role">Permission role</label>
                <select
                  id="nu-role"
                  value={newUser.roleId}
                  onChange={(e) => setNewUser((u) => ({ ...u, roleId: e.target.value }))}
                >
                  <option value="">No role assigned</option>
                  {(data.permissionRoles || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.description ? ` - ${r.description}` : ''}
                    </option>
                  ))}
                </select>
                <div className="field-hint">
                  Managed under <Link to="/admin/roles">Roles</Link>. Recorded against the account and shown in
                  listings; it does not restrict access yet - every administrator still reaches the whole console.
                </div>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="nu-name">Full name</label>
                <input
                  id="nu-name"
                  value={newUser.name}
                  onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="nu-email">Email</label>
                <input
                  id="nu-email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="nu-pass">Password</label>
              <input
                id="nu-pass"
                type="text"
                value={newUser.password}
                onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                autoComplete="new-password"
                required
              />
              <div className="field-hint">
                At least {newUser.role === 'admin' ? 8 : 6} characters. Shown in the clear so you can pass
                it on - the new user should change it after signing in.
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="nu-phone">Phone</label>
                <input
                  id="nu-phone"
                  value={newUser.phone}
                  onChange={(e) => setNewUser((u) => ({ ...u, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="nu-status">Status</label>
                <select
                  id="nu-status"
                  value={newUser.status}
                  onChange={(e) => setNewUser((u) => ({ ...u, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
