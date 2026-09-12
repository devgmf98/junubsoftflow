import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { fileSize, num, label, platformLabel } from '../../utils/format';

const KINDS = [
  ['source', 'Source code', 'code'],
  ['apk', 'Android build', 'android'],
  ['installer', 'Installer', 'download'],
  ['document', 'Documentation', 'file'],
];

const PLATFORMS = ['web', 'windows', 'mac', 'linux', 'android', 'ios'];

/**
 * Source code / builds for one premium add-on, so it can be sold on its own.
 * Buyers of just this add-on get these files and nothing else.
 */
export default function AdminAddonFiles() {
  const toast = useToast();
  const { addonId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: 'source', label: 'Source code', platform: 'web', version: '' });
  const [files, setFiles] = useState([]);
  const input = useRef(null);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api.get(`/admin/addons/${addonId}/files`).then(setData).catch((e) => setError(e.message));
  }, [addonId]);

  useEffect(() => {
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

      const res = await api.upload(`/admin/addons/${addonId}/bundle`, fd);
      toast.ok(
        `"${form.label}" uploaded${res.bundled ? ` — ${res.entryCount} files zipped into ${res.originalName}` : ''}.`
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
      await api.del(`/admin/addons/${addonId}/files/${f.id}`);
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
        title={data ? `${data.addon.name} — Files` : 'Add-on files'}
        subtitle="Source code and builds delivered when this add-on is bought on its own"
        onToggleSidebar={toggleSidebar}
        actions={
          data && (
            <Link to={`/admin/products/${data.addon.productId}/packages`} className="btn btn-outline btn-sm">
              Back to {data.addon.productName} packages
            </Link>
          )
        }
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          !error && <Loading variant="panel" />
        ) : (
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <h3>Deliverables</h3>
                <div className="right cell-sub">{data.files.length} attached</div>
              </div>
              <div className="panel-body tight">
                {!data.files.length ? (
                  <Empty icon="code">
                    Nothing attached yet. Whoever buys this add-on on its own gets no download until you add one.
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Label</th>
                          <th>Kind</th>
                          <th>Platform</th>
                          <th>Version</th>
                          <th className="num">Size</th>
                          <th className="num">Downloads</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.files.map((f) => (
                          <tr key={f.id}>
                            <td>
                              <span className="cell-main">{f.label}</span>
                              {f.originalName && (
                                <span className="cell-sub" style={{ display: 'block' }}>{f.originalName}</span>
                              )}
                              {f.missing && (
                                <span className="cell-sub" style={{ display: 'block', color: 'var(--bad)' }}>
                                  File missing from storage
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="badge badge-gray plain">{label(f.kind)}</span>
                            </td>
                            <td className="nowrap">
                              {f.kind === 'source' ? 'All platforms' : platformLabel(f.platform)}
                            </td>
                            <td className="nowrap">{f.version || '-'}</td>
                            <td className="num nowrap">{f.externalUrl ? 'External' : fileSize(f.size)}</td>
                            <td className="num">{num(f.downloadCount)}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--bad)' }}
                                  onClick={() => remove(f)}
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
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Attach source code or a build</h3></div>
              <div className="panel-body">
                <form onSubmit={upload}>
                  <div className="field">
                    <label>What are you uploading?</label>
                    <div className="kind-picker">
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

                  <div className="field">
                    <label htmlFor="f-label">Label</label>
                    <input id="f-label" value={form.label} onChange={set('label')} required />
                  </div>

                  <div className="field-row">
                    {/* source code is not tied to one platform, so there is nothing to choose */}
                    {!isFolder && (
                      <div className="field">
                        <label htmlFor="f-platform">Platform</label>
                        <select id="f-platform" value={form.platform} onChange={set('platform')}>
                          {PLATFORMS.map((p) => (
                            <option key={p} value={p}>{platformLabel(p)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="f-version">Version</label>
                      <input id="f-version" value={form.version} onChange={set('version')} placeholder="1.0.0" />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="f-files">{isFolder ? 'Source folder' : 'File'}</label>
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
                        ? 'Pick the folder holding the source — the whole tree is uploaded and zipped.'
                        : 'Pick the file to deliver.'}
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Uploading...' : (<><Icon name="upload" /> Attach to add-on</>)}
                  </button>

                  <p className="field-hint" style={{ marginTop: 12 }}>
                    <Icon name="lock" style={{ width: 12, display: 'inline', verticalAlign: -1 }} /> Released only to
                    customers who bought this add-on — buying the parent product does not unlock it.
                  </p>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
