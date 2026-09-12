import { useEffect, useState, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { downloadUrl } from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Modal, Kpi } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import {
  fileSize, num, date, timeAgo, label, statusClass, accentStyle,
  PLATFORM_GROUPS, platformLabel, platformIcon, platformAccent, APK_PLATFORMS, limitLabel,
} from '../../utils/format';

const BLANK = {
  title: '', productId: '', description: '', platform: 'web',
  webUrl: '', reviewUrl: '', apkVersion: '', visibility: 'public', status: 'published',
};

/** Admin: publish web review/demo links and upload Android APK builds. */
export default function AdminDemos() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [newApk, setNewApk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [filters, setFilters] = useState({ search: '', platform: '', status: '', hasApk: '' });
  const [term, setTerm] = useState('');
  const newApkInput = useRef(null);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    const q = new URLSearchParams(filters);
    api.get(`/admin/demos?${q}`).then(setData).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => setEditing((d) => ({ ...d, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing.id) {
        await api.put(`/admin/demos/${editing.id}`, editing);
        toast.ok(`"${editing.title}" was updated.`);
      } else {
        // a new demo can carry its APK in the same submit
        const fd = new FormData();
        Object.entries(editing).forEach(([k, v]) => fd.append(k, v ?? ''));
        if (newApk) fd.append('apk', newApk);
        const res = await api.upload('/admin/demos', fd);
        toast.ok(
          res.needsApk
            ? `"${editing.title}" was created. Upload the APK from its row when the build is ready.`
            : `"${editing.title}" was published.`
        );
      }
      setEditing(null);
      setNewApk(null);
      if (newApkInput.current) newApkInput.current.value = '';
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadApk = async (demo, file, version) => {
    if (!file) {
      toast.fail('Choose an .apk file to upload.');
      return;
    }
    setUploadingId(demo.id);
    setError('');
    try {
      const fd = new FormData();
      fd.append('apk', file);
      if (version) fd.append('apkVersion', version);
      const res = await api.upload(`/admin/demos/${demo.id}/apk`, fd);
      toast.ok(`APK uploaded for "${demo.title}"${res.apkVersion ? ` (v${res.apkVersion})` : ''}.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const removeApk = async (demo) => {
    if (!window.confirm(`Remove the APK from "${demo.title}"?`)) return;
    try {
      await api.del(`/admin/demos/${demo.id}/apk`);
      toast.ok(`The APK for "${demo.title}" was removed.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const removeDemo = async (demo) => {
    if (!window.confirm(`Delete "${demo.title}"? Its APK is removed from the server too.`)) return;
    try {
      await api.del(`/admin/demos/${demo.id}`);
      toast.ok(`"${demo.title}" was deleted.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  // KPI tiles show store-wide totals, so they stay steady while a filter is applied
  const totals = data?.totals || { demos: 0, published: 0, withApk: 0, downloads: 0 };
  const filtering = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Demos & APK"
        subtitle="Publish review links and Android builds"
        onToggleSidebar={toggleSidebar}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>
            <Icon name="plus" /> New demo
          </button>
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          <Loading />
        ) : (
          <>
            <div className="kpi-grid">
              <Kpi label="Demos" value={num(totals.demos)} icon="monitor" accent="blue" deltaLabel={`${totals.published} published`} />
              <Kpi label="Android builds" value={num(totals.withApk)} icon="android" accent="green" deltaLabel="APK attached" />
              <Kpi label="APK downloads" value={num(totals.downloads)} icon="download" accent="purple" deltaLabel="All time" />
              <Kpi label="Upload limit" value={limitLabel(data.maxApkMb)} icon="upload" accent="orange" deltaLabel="Per .apk file" />
            </div>

            {/* ---------- search & filters ---------- */}
            <div className="toolbar">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setFilters((f) => ({ ...f, search: term.trim() }));
                }}
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
              >
                <div className="search-box">
                  <Icon name="search" />
                  <input
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search title, link, APK or product"
                  />
                </div>

                <select
                  value={filters.platform}
                  onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
                >
                  <option value="">All platforms</option>
                  {PLATFORM_GROUPS.map(([group, options]) => (
                    <optgroup key={group} label={group}>
                      {options.map(([value, text]) => (
                        <option key={value} value={value}>{text}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>

                <select
                  value={filters.hasApk}
                  onChange={(e) => setFilters((f) => ({ ...f, hasApk: e.target.value }))}
                >
                  <option value="">APK: any</option>
                  <option value="yes">Has an APK</option>
                  <option value="no">No APK yet</option>
                </select>

                <button type="submit" className="btn btn-outline btn-sm">Search</button>

                {filtering && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setTerm('');
                      setFilters({ search: '', platform: '', status: '', hasApk: '' });
                    }}
                  >
                    Clear
                  </button>
                )}
              </form>
            </div>

            {filtering && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 14 }}>
                {num(data.matched)} of {num(totals.demos)} demo{totals.demos === 1 ? '' : 's'} match
              </p>
            )}

            {!data.demos.length && (
              <div className="panel">
                <div className="panel-body">
                  <Empty
                    icon="monitor"
                    action={
                      filtering ? (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setTerm('');
                            setFilters({ search: '', platform: '', status: '', hasApk: '' });
                          }}
                        >
                          Clear filters
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>
                          New demo
                        </button>
                      )
                    }
                  >
                    {filtering
                      ? 'No demos match that search.'
                      : 'No demos yet. Create one to publish a review link or an Android build.'}
                  </Empty>
                </div>
              </div>
            )}

            {data.demos.map((d) => (
              <DemoRow
                key={d.id}
                demo={d}
                uploading={uploadingId === d.id}
                onEdit={() => setEditing({ ...d, productId: d.productId || '' })}
                onDelete={() => removeDemo(d)}
                onUpload={(file, version) => uploadApk(d, file, version)}
                onRemoveApk={() => removeApk(d)}
              />
            ))}

            {data.recentDownloads.length > 0 && (
              <div className="panel">
                <div className="panel-head"><h3>Recent APK downloads</h3></div>
                <div className="panel-body tight">
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Demo</th>
                          <th>User</th>
                          <th>IP</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentDownloads.map((r) => (
                          <tr key={r.id}>
                            <td className="cell-main">{r.title}</td>
                            <td>{r.userName || 'Guest'}</td>
                            <td className="nowrap">{r.ipAddress || '-'}</td>
                            <td className="nowrap">{timeAgo(r.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <Modal
          wide
          title={editing.id ? `Edit "${editing.title}"` : 'New demo'}
          onClose={() => {
            setEditing(null);
            setNewApk(null);
          }}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => { setEditing(null); setNewApk(null); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving...' : editing.id ? 'Save changes' : 'Create demo'}
              </button>
            </>
          }
        >
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="d-title">Title</label>
              <input
                id="d-title"
                value={editing.title}
                onChange={set('title')}
                required
                placeholder="Antivirus Pro - Android Beta"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="d-platform">Platform</label>
                <select id="d-platform" value={editing.platform} onChange={set('platform')}>
                  {PLATFORM_GROUPS.map(([group, options]) => (
                    <optgroup key={group} label={group}>
                      {options.map(([value, text]) => (
                        <option key={value} value={value}>{text}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-product">Product</label>
                <select id="d-product" value={editing.productId} onChange={set('productId')}>
                  <option value="">Not linked</option>
                  {data?.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="d-web">Demo link</label>
              <input
                id="d-web"
                type="url"
                value={editing.webUrl || ''}
                onChange={set('webUrl')}
                placeholder="https://demo.softflow.com/store"
              />
            </div>

            <div className="field">
              <label htmlFor="d-review">Review link</label>
              <input
                id="d-review"
                type="url"
                value={editing.reviewUrl || ''}
                onChange={set('reviewUrl')}
                placeholder="https://review.softflow.com/store/walkthrough"
              />
              <div className="field-hint">Where reviewers leave feedback or watch the walkthrough.</div>
            </div>

            <div className="field">
              <label htmlFor="d-desc">Description</label>
              <textarea
                id="d-desc"
                value={editing.description || ''}
                onChange={set('description')}
                placeholder="What testers should look at, and any demo credentials."
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="d-vis">Visible to</label>
                <select id="d-vis" value={editing.visibility} onChange={set('visibility')}>
                  <option value="public">Everyone (public site)</option>
                  <option value="users">Signed-in users only</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-status">Status</label>
                <select id="d-status" value={editing.status} onChange={set('status')}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="d-ver">APK version</label>
                <input id="d-ver" value={editing.apkVersion || ''} onChange={set('apkVersion')} placeholder="8.2.1" />
              </div>
              {!editing.id && (
                <div className="field">
                  <label htmlFor="d-apk">
                    APK file <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                  </label>
                  <input
                    id="d-apk"
                    type="file"
                    accept=".apk,application/vnd.android.package-archive"
                    ref={newApkInput}
                    onChange={(e) => setNewApk(e.target.files?.[0] || null)}
                  />
                  <div className="field-hint">
                    Up to {limitLabel(data?.maxApkMb)} per build.{' '}
                    {newApk && <b style={{ color: 'var(--a-green)' }}>{newApk.name} ({fileSize(newApk.size)})</b>}
                  </div>
                </div>
              )}
            </div>

            {editing.id && (
              <div className="field-hint" style={{ marginTop: 0 }}>
                Upload or replace the APK file itself from the demo row.
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}

/** One demo, with its links on the left and the APK panel on the right. */
function DemoRow({ demo, uploading, onEdit, onDelete, onUpload, onRemoveApk }) {
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState(demo.apkVersion || '');
  const input = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    onUpload(file, version);
    setFile(null);
    if (input.current) input.current.value = '';
  };

  const expectsApk = APK_PLATFORMS.includes(demo.platform);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="kpi-ic" style={{ ...accentStyle(platformAccent(demo.platform)), flex: 'none' }}>
          <Icon name={platformIcon(demo.platform)} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3>{demo.title}</h3>
          <div className="sub">
            {platformLabel(demo.platform)}
            {demo.productName && ` · ${demo.productName}`}
            {` · ${demo.visibility === 'public' ? 'Public' : 'Signed-in users'}`}
          </div>
        </div>
        <div className="right">
          <span className={`badge ${statusClass(demo.status)}`}>{label(demo.status)}</span>
          <button className="btn btn-outline btn-sm" onClick={onEdit}>
            <Icon name="edit" /> Edit
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)' }} onClick={onDelete} title="Delete">
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="panel-body">
        {demo.description && <p style={{ fontSize: 12, marginBottom: 14 }}>{demo.description}</p>}

        <div className="grid-2e">
          {/* ---------- web links ---------- */}
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 10, padding: 14, background: '#fdfdff' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                color: 'var(--muted)',
                marginBottom: 12,
              }}
            >
              <Icon name="monitor" style={{ width: 15, height: 15 }} /> Web links
            </div>

            {[['Demo', demo.webUrl], ['Review', demo.reviewUrl]].map(([name, url]) => (
              <div key={name} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', fontSize: 12 }}>
                <span style={{ width: 58, flex: 'none', color: 'var(--muted)', fontSize: 11 }}>{name}</span>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
                    {url}
                  </a>
                ) : (
                  <span style={{ color: '#cbd5e1' }}>Not set</span>
                )}
              </div>
            ))}
          </div>

          {/* ---------- APK ---------- */}
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 10, padding: 14, background: '#fdfdff' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                color: 'var(--muted)',
                marginBottom: 12,
              }}
            >
              <Icon name="android" style={{ width: 15, height: 15 }} /> Android build (APK)
            </div>

            {demo.apkMissing && (
              <Alert type="error">The file is recorded but missing from storage. Upload the build again.</Alert>
            )}

            {!expectsApk && !demo.hasApk && (
              <p className="cell-sub" style={{ marginBottom: 12 }}>
                This demo targets {platformLabel(demo.platform)}. An APK is optional here - attach one only if you
                also ship an Android build.
              </p>
            )}

            {demo.hasApk ? (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 9,
                  padding: '10px 12px',
                  marginBottom: 12,
                  fontSize: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <b style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{demo.apkName}</b>
                  <div className="cell-sub">
                    {demo.apkVersion && `v${demo.apkVersion} · `}
                    {fileSize(demo.apkSize)} · uploaded {date(demo.apkUploadedAt)} · {num(demo.downloadCount)} downloads
                  </div>
                </div>
                <div className="row-actions">
                  <a href={downloadUrl(`/admin/demos/${demo.id}/apk`)} className="btn btn-outline btn-sm" title="Download">
                    <Icon name="download" />
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--bad)' }}
                    onClick={onRemoveApk}
                    title="Remove APK"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ) : (
              expectsApk && <p className="cell-sub" style={{ marginBottom: 12 }}>No APK uploaded yet.</p>
            )}

            <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                ref={input}
                accept=".apk,application/vnd.android.package-archive"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ fontSize: 11, maxWidth: 190 }}
                required
              />
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="Version"
                style={{
                  width: 110,
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '7px 10px',
                  fontSize: 11.5,
                  fontFamily: 'inherit',
                }}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={uploading}>
                <Icon name="upload" /> {uploading ? 'Uploading...' : demo.hasApk ? 'Replace' : 'Upload'}
              </button>
              {file && (
                <span style={{ fontSize: 11, color: 'var(--a-green)', fontWeight: 500, width: '100%' }}>
                  {file.name} ({fileSize(file.size)})
                </span>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
