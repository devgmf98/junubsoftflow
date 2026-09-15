import { useEffect, useState, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { downloadUrl } from '../../api/client';
import Icon from '../../components/Icon';
import DemoThumb from '../../components/DemoThumb';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty, Modal, Kpi } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import {
  fileSize, num, date, timeAgo, label, statusClass,
  PLATFORM_GROUPS, platformLabel, MOBILE_PLATFORMS, DEMO_BUILDS, demoBuild, limitLabel,
} from '../../utils/format';

const BLANK = {
  title: '', productId: '', description: '', platform: 'web',
  webUrl: '', reviewUrl: '', apkVersion: '', ipaVersion: '', visibility: 'public', status: 'published',
};

/** Admin: publish web review/demo links and upload the Android and iOS builds. */
export default function AdminDemos() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  // one pending file per slot while a demo is being created
  const [newBuilds, setNewBuilds] = useState({ apk: null, ipa: null });
  const [busy, setBusy] = useState(false);
  // which demo, and which of its two slots, is mid-upload
  const [uploading, setUploading] = useState(null);
  const [filters, setFilters] = useState({ search: '', platform: '', status: '', hasApk: '' });
  const [term, setTerm] = useState('');
  const newBuildInputs = { apk: useRef(null), ipa: useRef(null) };
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
        // a new demo can carry both of its builds in the same submit
        const fd = new FormData();
        Object.entries(editing).forEach(([k, v]) => fd.append(k, v ?? ''));
        DEMO_BUILDS.forEach((slot) => newBuilds[slot.path] && fd.append(slot.path, newBuilds[slot.path]));
        const res = await api.upload('/admin/demos', fd);
        toast.ok(
          res.needsBuild
            ? `"${editing.title}" was created. Upload the build from its row when it is ready.`
            : `"${editing.title}" was published.`
        );
      }
      setEditing(null);
      setNewBuilds({ apk: null, ipa: null });
      DEMO_BUILDS.forEach((slot) => {
        const el = newBuildInputs[slot.path].current;
        if (el) el.value = '';
      });
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  // each slot posts to its own route, so replacing one build leaves the other alone
  const uploadBuild = async (demo, slot, file, version) => {
    if (!file) {
      toast.fail(`Choose the ${slot.ext} file to upload.`);
      return;
    }
    setUploading({ id: demo.id, os: slot.os });
    setError('');
    try {
      const fd = new FormData();
      fd.append(slot.path, file);
      if (version) fd.append(slot.versionKey, version);
      const res = await api.upload(`/admin/demos/${demo.id}/${slot.path}`, fd);
      toast.ok(`${slot.title} uploaded for "${demo.title}"${res.version ? ` (v${res.version})` : ''}.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setUploading(null);
    }
  };

  const removeBuild = async (demo, slot) => {
    if (!window.confirm(`Remove the ${slot.format} from "${demo.title}"?`)) return;
    try {
      await api.del(`/admin/demos/${demo.id}/${slot.path}`);
      toast.ok(`The ${slot.format} for "${demo.title}" was removed.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const removeDemo = async (demo) => {
    if (!window.confirm(`Delete "${demo.title}"? Its builds are removed from the server too.`)) return;
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
        title="Demos & builds"
        subtitle="Publish review links and the Android and iOS builds"
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
              <Kpi label="Mobile builds" value={num(totals.withApk)} icon="android" accent="green" deltaLabel="demos with a build" />
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
                  <option value="">Builds: any</option>
                  <option value="yes">Has a build</option>
                  <option value="no">No build yet</option>
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
                uploading={uploading && uploading.id === d.id ? uploading.os : null}
                onEdit={() => setEditing({ ...d, productId: d.productId || '' })}
                onDelete={() => removeDemo(d)}
                onUpload={(slot, file, version) => uploadBuild(d, slot, file, version)}
                onRemoveBuild={(slot) => removeBuild(d, slot)}
              />
            ))}

            {data.recentDownloads.length > 0 && (
              <div className="panel">
                <div className="panel-head"><h3>Recent build downloads</h3></div>
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

            {!editing.id && (
              // both builds can come up with the demo; neither is required
              <div className="field-row">
                {DEMO_BUILDS.map((slot) => (
                  <div className="field" key={slot.os}>
                    <label htmlFor={`d-${slot.path}`}>
                      {slot.title} <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                    </label>
                    <input
                      id={`d-${slot.path}`}
                      type="file"
                      accept={slot.ext}
                      ref={newBuildInputs[slot.path]}
                      onChange={(e) =>
                        setNewBuilds((b) => ({ ...b, [slot.path]: e.target.files?.[0] || null }))
                      }
                    />
                    <input
                      value={editing[slot.versionKey] || ''}
                      onChange={set(slot.versionKey)}
                      placeholder={`${slot.format} version`}
                      style={{ marginTop: 6 }}
                    />
                    <div className="field-hint">
                      {slot.ext}, up to {limitLabel(data?.maxApkMb)}.{' '}
                      {newBuilds[slot.path] && (
                        <b style={{ color: 'var(--a-green)' }}>
                          {newBuilds[slot.path].name} ({fileSize(newBuilds[slot.path].size)})
                        </b>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {editing.id && (
              <div className="field-hint" style={{ marginTop: 0 }}>
                The builds themselves are uploaded and replaced from the demo row.
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}

/** One demo: its links on the left, its two build slots on the right. */
function DemoRow({ demo, uploading, onEdit, onDelete, onUpload, onRemoveBuild }) {
  const expectsBuild = MOBILE_PLATFORMS.includes(demo.platform);

  return (
    <div className="panel">
      <div className="panel-head">
        <DemoThumb demo={demo} />
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

          {/* ---------- builds: Android and iOS, one slot each ---------- */}
          <div style={{ display: 'grid', gap: 10 }}>
            {DEMO_BUILDS.map((slot) => (
              <BuildSlot
                key={slot.os}
                slot={slot}
                demo={demo}
                build={demoBuild(demo, slot.os)}
                expected={expectsBuild}
                uploading={uploading === slot.os}
                onUpload={(file, version) => onUpload(slot, file, version)}
                onRemove={() => onRemoveBuild(slot)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * One build slot on a demo - the Android .apk or the iOS .ipa.
 *
 * The two are independent: each has its own file, version, upload and remove, and
 * replacing one never touches the other. A demo that ships on both stores keeps
 * both here at once.
 */
function BuildSlot({ slot, demo, build, expected, uploading, onUpload, onRemove }) {
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState(build?.version || '');
  const input = useRef(null);

  // the list reloads after an upload without remounting this row, so follow it
  useEffect(() => {
    setVersion(build?.version || '');
  }, [build?.version]);

  const submit = (e) => {
    e.preventDefault();
    onUpload(file, version);
    setFile(null);
    if (input.current) input.current.value = '';
  };

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 10, padding: 14, background: '#fdfdff' }}>
      <div className="build-slot-head">
        <Icon name={slot.icon} /> {slot.title} ({slot.ext})
      </div>

      {build?.missing && (
        <Alert type="error">The file is recorded but missing from storage. Upload the build again.</Alert>
      )}

      {build ? (
        <div className="build-slot-file">
          <div style={{ minWidth: 0 }}>
            <b style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{build.name}</b>
            <div className="cell-sub">
              {build.version && `v${build.version} · `}
              {fileSize(build.size)} · uploaded {date(build.uploadedAt)}
            </div>
          </div>
          <div className="row-actions">
            <a
              href={downloadUrl(`/admin/demos/${demo.id}/${slot.path}`)}
              className="btn btn-outline btn-sm"
              title="Download"
            >
              <Icon name="download" />
            </a>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--bad)' }}
              onClick={onRemove}
              title={`Remove ${slot.format}`}
            >
              <Icon name="trash" />
            </button>
          </div>
        </div>
      ) : (
        <p className="cell-sub" style={{ marginBottom: 12 }}>
          {expected
            ? `No ${slot.format} uploaded yet.`
            : `Optional - this demo targets ${platformLabel(demo.platform)}. Attach one if you ship it here too.`}
        </p>
      )}

      {slot.os === 'ios' && (
        <p className="cell-sub" style={{ marginBottom: 12 }}>
          An .ipa does not install from a browser the way an .apk does: a tester needs TestFlight, or an ad-hoc
          build and a device already on the provisioning profile. Put the TestFlight invite in the demo link.
        </p>
      )}

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="file"
          ref={input}
          accept={slot.ext}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ fontSize: 11, maxWidth: 170 }}
          required
        />
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="Version"
          style={{
            width: 96,
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 11.5,
            fontFamily: 'inherit',
          }}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={uploading}>
          <Icon name="upload" /> {uploading ? 'Uploading...' : build ? 'Replace' : 'Upload'}
        </button>
        {file && (
          <span style={{ fontSize: 11, color: 'var(--a-green)', fontWeight: 500, width: '100%' }}>
            {file.name} ({fileSize(file.size)})
          </span>
        )}
      </form>
    </div>
  );
}
