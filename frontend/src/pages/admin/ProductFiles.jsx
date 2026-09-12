import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import api, { downloadUrl } from '../../api/client';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { fileSize, num, label, limitLabel } from '../../utils/format';

const PLATFORMS = ['windows', 'mac', 'linux', 'android', 'ios', 'web'];

/** Installers and mobile builds attached to a product. */
export default function AdminProductFiles() {
  const toast = useToast();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ label: '', platform: 'windows', version: '', externalUrl: '', requiresPurchase: true });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const { toggleSidebar } = useOutletContext();

  const load = useCallback(() => {
    api.get(`/admin/products/${id}/files`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);

      await api.upload(`/admin/products/${id}/files`, fd);
      toast.ok(`"${form.label}" was added to the downloads.`);
      setForm({ label: '', platform: 'windows', version: '', externalUrl: '', requiresPurchase: true });
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
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
      await api.del(`/admin/products/${id}/files/${f.id}`);
      toast.ok(`"${f.label}" was removed.`);
      load();
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title={data ? `${data.product.name} — Downloads` : 'Downloads'}
        subtitle="Installers and mobile builds buyers can download"
        onToggleSidebar={toggleSidebar}
        actions={<Link to="/admin/products" className="btn btn-outline btn-sm">Back to products</Link>}
      />

      <div className="page">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {!data ? (
          !error && <Loading variant="panel" />
        ) : (
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <h3>Files</h3>
                <div className="right cell-sub">{data.files.length} attached</div>
              </div>
              <div className="panel-body tight">
                {!data.files.length ? (
                  <Empty icon="download">No downloads attached to this product yet.</Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Label</th>
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
                              {f.missing && (
                                <span className="cell-sub" style={{ display: 'block', color: 'var(--bad)' }}>
                                  File missing from storage
                                </span>
                              )}
                              {f.externalUrl && (
                                <span className="cell-sub" style={{ display: 'block', wordBreak: 'break-all' }}>
                                  {f.externalUrl}
                                </span>
                              )}
                              {!f.requiresPurchase && (
                                <span className="cell-sub" style={{ display: 'block' }}>Free download</span>
                              )}
                              {f.packageName ? (
                                <Link
                                  to={`/admin/packages/${f.packageId}/files`}
                                  className="cell-sub"
                                  style={{ display: 'block' }}
                                >
                                  <Icon name="box" style={{ width: 11, height: 11, marginRight: 4, verticalAlign: -1 }} />
                                  {f.packageName} package only
                                </Link>
                              ) : (
                                <span className="cell-sub" style={{ display: 'block' }}>Every buyer</span>
                              )}
                            </td>
                            <td>
                              <span className="badge badge-gray plain">
                                {f.kind === 'source' ? 'All platforms' : label(f.platform)}
                              </span>
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
              <div className="panel-head"><h3>Add a download</h3></div>
              <div className="panel-body">
                <form onSubmit={submit}>
                  <div className="field">
                    <label htmlFor="f-label">Label</label>
                    <input
                      id="f-label"
                      value={form.label}
                      onChange={set('label')}
                      placeholder="Office 365 Installer"
                      required
                    />
                  </div>

                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="f-platform">Platform</label>
                      <select id="f-platform" value={form.platform} onChange={set('platform')}>
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p}>{label(p)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="f-version">Version</label>
                      <input id="f-version" value={form.version} onChange={set('version')} placeholder="8.2.1" />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="f-file">Upload a file</label>
                    <input
                      id="f-file"
                      type="file"
                      ref={fileInput}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      accept=".apk,.exe,.msi,.dmg,.pkg,.zip,.gz,.tgz,.iso,.deb,.rpm,.appimage"
                    />
                    <div className="field-hint">
                      Up to {limitLabel(data.maxFileMb)} per file. {file && <b style={{ color: 'var(--a-green)' }}>{file.name} ({fileSize(file.size)})</b>}
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="f-url">…or link to an external download</label>
                    <input
                      id="f-url"
                      value={form.externalUrl}
                      onChange={set('externalUrl')}
                      placeholder="https://vendor.example.com/installer"
                    />
                    <div className="field-hint">Use this when the publisher hosts the file themselves.</div>
                  </div>

                  <label className="field-check" style={{ marginBottom: 16 }}>
                    <input type="checkbox" checked={form.requiresPurchase} onChange={set('requiresPurchase')} />
                    Only buyers of this product can download it
                  </label>

                  <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Uploading...' : (<><Icon name="upload" /> Add download</>)}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
