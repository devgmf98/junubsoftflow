import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { fileSize, num, label, money, platformLabel } from '../../utils/format';

const KINDS = [
  ['source', 'Source code', 'code'],
  ['apk', 'Android build', 'android'],
  ['installer', 'Installer', 'download'],
  ['document', 'Documentation', 'file'],
];

const PLATFORMS = ['web', 'windows', 'mac', 'linux', 'android', 'ios'];

const LICENSE_ORDER = ['regular', 'extended', 'agency'];

const KIND_ICON = { source: 'code', apk: 'android', installer: 'download', document: 'file' };
const KIND_ACCENT = { source: 'ic-purple', apk: 'ic-green', installer: 'ic-blue', document: 'ic-blue' };

/**
 * The folder that ships with one pricing package.
 * Only customers who bought this exact package can download what is attached here -
 * buying the same product on a cheaper tier does not unlock it.
 */
export default function AdminPackageFiles() {
  const toast = useToast();
  const { packageId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: 'source', label: 'Source code', platform: 'web', version: '' });
  const [files, setFiles] = useState([]);
  const input = useRef(null);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api.get(`/admin/packages/${packageId}/files`).then(setData).catch((e) => setError(e.message));
  }, [packageId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const pickKind = (kind) => {
    const preset = KINDS.find((k) => k[0] === kind);
    setForm((f) => ({
      ...f,
      kind,
      label: preset ? preset[1] : f.label,
      platform: kind === 'apk' ? 'android' : f.platform,
    }));
    setFiles([]);
    if (input.current) input.current.value = '';
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!files.length) {
      toast.fail('Choose a folder or at least one file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      // relative paths travel separately - the upload filename loses its folders
      files.forEach((f) => fd.append('paths', f.webkitRelativePath || f.name));
      files.forEach((f) => fd.append('files', f, f.name));
      fd.append('kind', form.kind);
      fd.append('label', form.label);
      fd.append('platform', form.platform);
      if (form.version) fd.append('version', form.version);

      const res = await api.upload(`/admin/packages/${packageId}/bundle`, fd);
      toast.ok(
        `"${form.label}" is now part of the ${data.package.name} package${
          res.bundled ? ` — ${res.entryCount} files zipped into ${res.originalName}` : ''
        }.`
      );
      setFiles([]);
      if (input.current) input.current.value = '';
      load();
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f) => {
    if (!window.confirm(`Remove "${f.label}"? The stored file is deleted too.`)) return;
    try {
      await api.del(`/admin/packages/${packageId}/files/${f.id}`);
      toast.ok(`"${f.label}" was removed.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  const isFolder = form.kind === 'source';

  return (
    <>
      <PageHeader
        title={data ? `${data.package.name} — Package folder` : 'Package folder'}
        subtitle="Delivered only to customers who bought this package"
        onToggleSidebar={toggleSidebar}
        actions={
          data && (
            <Link to={`/admin/products/${data.package.productId}/packages`} className="btn btn-outline btn-sm">
              Back to {data.package.productName} packages
            </Link>
          )
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          !error && <Loading variant="panel" />
        ) : (
          <>
            {/* which tier we are editing, and how the others compare */}
            <div className="panel pkg-switch-panel">
              <div className="panel-body">
                {LICENSE_ORDER.filter((t) => data.siblings.some((s2) => s2.licenseType === t)).map((t) => (
                  <div className="pkg-switch-row" key={t}>
                    <span className="pkg-switch-tier">{label(t)}</span>
                    <div className="pkg-switch-chips">
                      {data.siblings
                        .filter((s2) => s2.licenseType === t)
                        .map((s2) => (
                          <Link
                            key={s2.id}
                            to={`/admin/packages/${s2.id}/files`}
                            className={`pkg-file-chip ${s2.id === data.package.id ? 'on' : ''}`}
                          >
                            {s2.name}
                            <span className={`badge ${s2.fileCount ? 'badge-green' : 'badge-amber'} plain`}>
                              {s2.fileCount || 'empty'}
                            </span>
                          </Link>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head">
                  <h3>In the {data.package.name} folder</h3>
                  <div className="right">
                    <span className={`badge ${data.package.licenseType === 'agency' ? 'badge-purple' : 'badge-gray'} plain`}>
                      {label(data.package.licenseType)} licence
                    </span>
                  </div>
                </div>

                {/* what this tier is, at a glance - the folder is only half the story */}
                <div className="pkg-stats">
                  <div className="pkg-stat">
                    <span className="pkg-stat-v">{money(data.package.price)}</span>
                    <span className="pkg-stat-k">Price</span>
                  </div>
                  <div className="pkg-stat">
                    <span className="pkg-stat-v">{num(data.package.licenseCount)}</span>
                    <span className="pkg-stat-k">Licence{data.package.licenseCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="pkg-stat">
                    <span className="pkg-stat-v">{num(data.package.buyers)}</span>
                    <span className="pkg-stat-k">Buyer{data.package.buyers === 1 ? '' : 's'}</span>
                  </div>
                  <div className="pkg-stat">
                    <span className="pkg-stat-v">
                      {data.files.length
                        ? fileSize(data.files.reduce((t, f) => t + (f.size || 0), 0))
                        : '—'}
                    </span>
                    <span className="pkg-stat-k">Folder size</span>
                  </div>
                </div>

                <div className="panel-body tight">
                  {!data.files.length ? (
                    <Empty icon="box">
                      Nothing attached yet. Customers on this package get only the shared product files below.
                    </Empty>
                  ) : (
                    <div className="pkg-file-list">
                      {data.files.map((f) => (
                        <div className="pkg-file" key={f.id}>
                          <span className={`kpi-ic ${KIND_ACCENT[f.kind] || 'ic-blue'}`}>
                            <Icon name={KIND_ICON[f.kind] || 'file'} />
                          </span>

                          <div className="pkg-file-main">
                            <span className="pkg-file-label">{f.label}</span>
                            {f.originalName && <span className="pkg-file-src">{f.originalName}</span>}
                            <div className="pkg-file-meta">
                              <span className="badge badge-gray plain">{label(f.kind)}</span>
                              <span>{f.kind === 'source' ? 'All platforms' : platformLabel(f.platform)}</span>
                              {f.version && <span>v{f.version}</span>}
                              <span>{f.externalUrl ? 'External' : fileSize(f.size)}</span>
                              <span>{num(f.downloadCount)} download{f.downloadCount === 1 ? '' : 's'}</span>
                            </div>
                            {f.missing && (
                              <div className="pkg-file-warn">
                                <Icon name="alert" /> File missing from storage
                              </div>
                            )}
                          </div>

                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--bad)' }}
                            onClick={() => remove(f)}
                            title="Delete"
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.sharedFiles.length > 0 && (
                    <div className="pkg-shared">
                      <div className="pkg-shared-head">
                        <Icon name="users" />
                        Every buyer of {data.package.productName} also gets
                      </div>
                      <div className="pkg-shared-items">
                        {data.sharedFiles.map((f) => (
                          <span className="pkg-shared-item" key={f.id}>
                            <Icon name={KIND_ICON[f.kind] || 'file'} />
                            {f.label}
                          </span>
                        ))}
                      </div>
                      <div className="pkg-shared-note">
                        Managed on the product’s{' '}
                        <Link to={`/admin/products/${data.package.productId}/files`}>Downloads page</Link>.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Upload this package’s folder</h3></div>
                <div className="panel-body">
                  <form onSubmit={upload}>
                    <div className="field">
                      <label>What are you uploading?</label>
                      <div className="kind-picker kind-picker-row">
                        {KINDS.map(([value, text, icon]) => (
                          <button
                            type="button"
                            key={value}
                            className={`kind-option ${form.kind === value ? 'on' : ''}`}
                            onClick={() => pickKind(value)}
                          >
                            <Icon name={icon} />
                            {text}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="f-label">Label</label>
                        <input id="f-label" value={form.label} onChange={set('label')} required />
                      </div>
                      <div className="field" style={{ maxWidth: 130 }}>
                        <label htmlFor="f-version">Version</label>
                        <input id="f-version" value={form.version} onChange={set('version')} placeholder="1.0.0" />
                      </div>
                      {/* source code is not tied to one platform, so there is nothing to choose */}
                      {!isFolder && (
                        <div className="field" style={{ maxWidth: 150 }}>
                          <label htmlFor="f-platform">Platform</label>
                          <select id="f-platform" value={form.platform} onChange={set('platform')}>
                            {PLATFORMS.map((p) => (
                              <option key={p} value={p}>{platformLabel(p)}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="field">
                      <label htmlFor="f-files">{isFolder ? 'Package folder' : 'File'}</label>
                      <input
                        id="f-files"
                        type="file"
                        ref={input}
                        multiple
                        {...(isFolder ? { webkitdirectory: '', directory: '' } : {})}
                        accept={form.kind === 'apk' ? '.apk' : undefined}
                        onChange={(e) => setFiles(Array.from(e.target.files || []))}
                      />
                      <div className="field-hint">
                        {files.length
                          ? `${files.length} file${files.length === 1 ? '' : 's'} · ${fileSize(
                              files.reduce((s, f) => s + f.size, 0)
                            )}${files.length > 1 ? ' — zipped into one archive' : ''}`
                          : isFolder
                          ? `Pick the folder that ships with ${data.package.name} — the whole tree is uploaded and zipped.`
                          : 'Pick the file to deliver.'}
                      </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                      {busy ? 'Uploading...' : (<><Icon name="upload" /> Attach to {data.package.name}</>)}
                    </button>

                    <p className="field-hint" style={{ marginTop: 12 }}>
                      <Icon name="lock" style={{ width: 12, display: 'inline', verticalAlign: -1 }} /> Released only
                      to customers who bought <b>{data.package.name}</b>. Buying a cheaper package of the same
                      product does not unlock it.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
