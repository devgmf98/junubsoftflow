import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api, { downloadUrl } from '../../api/client';
import Icon from '../../components/Icon';
import ImageSlider from '../../components/ImageSlider';
import ProductThumb from '../../components/ProductThumb';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading, Alert, Empty } from '../../components/ui';
import {
  fileSize, date, num, label, accentStyle,
  platformLabel, platformIcon, platformAccent,
} from '../../utils/format';

/** Step 8 of the reference flow: installers for what you own, plus demo builds. */
export default function AccountDownloads() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { images, captions, title }
  const { toggleSidebar } = useOutletContext();

  useEffect(() => {
    api.get('/account/downloads').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Downloads"
        subtitle="Installers for what you own, plus the demo builds"
        onToggleSidebar={toggleSidebar}
        actions={<Link to="/account/licenses" className="btn btn-outline btn-sm">
          <Icon name="key" /> Licences
        </Link>}
      />

      <div className="page">
        {error && <Alert type="error">{error}</Alert>}

        {!data ? (
          <Loading variant="panel" />
        ) : (
          <>
            {/* ---------- everything this account owns ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Your software</h3>
                <div className="right cell-sub">
                  {data.products.length} product{data.products.length === 1 ? '' : 's'} owned
                </div>
              </div>
              <div className="panel-body tight">
                {!data.products.length ? (
                  <Empty
                    icon="download"
                    action={<Link to="/products" className="btn btn-primary btn-sm">Browse products</Link>}
                  >
                    Nothing here yet. Anything you buy shows up on this page.
                  </Empty>
                ) : (
                  data.products.map((p) => (
                    <div key={p.id} className="owned-product">
                      <div className="owned-head">
                        <ProductThumb product={p} size={34} radius={9} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Link to={`/products/${p.slug}`} className="cell-main" style={{ color: 'inherit' }}>
                            {p.name}
                          </Link>
                          <div className="cell-sub">
                            {p.packages?.length > 0 && `${p.packages.map((k) => k.name).join(' + ')} · `}
                            {p.licences > 0 && `${num(p.licences)} licence${p.licences === 1 ? '' : 's'}`}
                            {p.licenceTerm && ` · ${p.licenceTerm}`}
                            {p.purchasedAt && ` · bought ${date(p.purchasedAt)}`}
                            {p.licenceExpiresAt && !p.licenceExpired && (
                              <> · renews {date(p.licenceExpiresAt)}</>
                            )}
                          </div>
                        </div>
                        <Link to="/account/licenses" className="btn btn-ghost btn-sm">
                          <Icon name="key" /> Licence
                        </Link>
                      </div>

                      {p.licenceExpired && (
                        <p className="owned-expired">
                          <Icon name="alert" />
                          <span>
                            Your licence expired on <b>{date(p.licenceExpiresAt)}</b>. Downloads are paused -
                            renew to get updated source code and builds. Files you already downloaded are yours
                            to keep.
                          </span>
                          <Link to="/account/licenses" className="btn btn-primary btn-sm">Renew</Link>
                        </p>
                      )}

                      {!p.files.length ? (
                        <p className="owned-none">
                          No installer has been published for this product yet. Your licence key is ready under{' '}
                          <Link to="/account/licenses">Delivery &amp; Licences</Link>, and downloads will appear here
                          as soon as they are available.
                        </p>
                      ) : (
                        <div className="table-wrap">
                          <table className="data">
                            <thead>
                              <tr>
                                <th>Download</th>
                                <th>Platform</th>
                                <th>Version</th>
                                <th className="num">Size</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {p.files.map((f) => (
                                <tr key={f.id}>
                                  <td>
                                    <span className="cell-main">{f.label}</span>
                                    {f.packageName && (
                                      <span className="cell-sub" style={{ display: 'block' }}>
                                        <Icon
                                          name="box"
                                          style={{ width: 11, height: 11, marginRight: 4, verticalAlign: -1 }}
                                        />
                                        {f.packageName} package
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <span className="badge badge-gray plain">
                                      <Icon
                                        name={f.kind === 'source' ? 'code' : platformIcon(f.platform)}
                                        style={{ width: 12, height: 12, marginRight: 4 }}
                                      />
                                      {f.kind === 'source' ? 'Source' : platformLabel(f.platform)}
                                    </span>
                                  </td>
                                  <td className="nowrap">{f.version || '-'}</td>
                                  <td className="num nowrap">{f.isExternal ? 'External' : fileSize(f.size)}</td>
                                  <td>
                                    <div className="row-actions">
                                      {p.licenceExpired ? (
                                        <span className="badge badge-amber" title="Renew your licence to download again.">
                                          Licence expired
                                        </span>
                                      ) : f.available ? (
                                        <a
                                          href={downloadUrl(`/account/downloads/file/${f.id}`)}
                                          className="btn btn-outline btn-sm"
                                        >
                                          <Icon name="download" /> Download
                                        </a>
                                      ) : (
                                        <span
                                          className="badge badge-amber"
                                          title="The file is not on the server right now - contact support."
                                        >
                                          Unavailable
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ---------- add-ons bought on their own ---------- */}
            {data.addons?.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Your add-ons</h3>
                  <div className="right cell-sub">
                    {data.addons.length} add-on{data.addons.length === 1 ? '' : 's'} owned
                  </div>
                </div>
                <div className="panel-body tight">
                  {data.addons.map((a) => (
                    <div key={a.id} className="owned-product">
                      <div className="owned-head">
                        <ProductThumb product={a} size={34} radius={9} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span className="cell-main">{a.name}</span>
                          <div className="cell-sub">
                            {a.licenseTypes.map((t) => label(t)).join(', ') || 'Regular'} licence
                            {a.purchasedAt && ` · bought ${date(a.purchasedAt)}`}
                          </div>
                        </div>
                        <span className="owned-addon-tag">Add-on</span>
                      </div>

                      {!a.files.length ? (
                        <p className="owned-none">
                          No source code has been published for this add-on yet. It will appear here as soon as it is
                          available.
                        </p>
                      ) : (
                        <div className="table-wrap">
                          <table className="data">
                            <thead>
                              <tr>
                                <th>Download</th>
                                <th>Platform</th>
                                <th>Version</th>
                                <th className="num">Size</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {a.files.map((f) => (
                                <tr key={f.id}>
                                  <td className="cell-main">{f.label}</td>
                                  <td>
                                    <span className="badge badge-gray plain">
                                      <Icon
                                        name={f.kind === 'source' ? 'code' : platformIcon(f.platform)}
                                        style={{ width: 12, height: 12, marginRight: 4 }}
                                      />
                                      {f.kind === 'source' ? 'Source' : platformLabel(f.platform)}
                                    </span>
                                  </td>
                                  <td className="nowrap">{f.version || '-'}</td>
                                  <td className="num nowrap">{f.isExternal ? 'External' : fileSize(f.size)}</td>
                                  <td>
                                    <div className="row-actions">
                                      {f.available ? (
                                        <a
                                          href={downloadUrl(`/account/downloads/file/${f.id}`)}
                                          className="btn btn-outline btn-sm"
                                        >
                                          <Icon name="download" /> Download
                                        </a>
                                      ) : (
                                        <span className="badge badge-amber">Unavailable</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---------- demo builds ---------- */}
            <div className="panel">
              <div className="panel-head">
                <h3>Demos &amp; trial builds</h3>
                <div className="right cell-sub">Available to every account</div>
              </div>
              <div className="panel-body">
                {!data.demos.length ? (
                  <Empty icon="monitor">No demos published yet.</Empty>
                ) : (
                  <div
                    className="product-grid"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
                  >
                    {data.demos.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          border: '1px solid var(--line)',
                          borderRadius: 'var(--radius)',
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 9,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                          <span
                            className="kpi-ic"
                            style={{ ...accentStyle(platformAccent(d.platform)), flex: 'none' }}
                          >
                            <Icon name={platformIcon(d.platform)} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: 13.5 }}>{d.title}</h3>
                            <div className="cell-sub">
                              {platformLabel(d.platform)}
                              {d.productName && ` · ${d.productName}`}
                            </div>
                          </div>
                        </div>

                        {d.description && (
                          <p style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>{d.description}</p>
                        )}

                        {d.hasApk && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 9,
                              alignItems: 'center',
                              background: 'var(--bg-soft)',
                              border: '1px solid var(--line-2)',
                              borderRadius: 9,
                              padding: '9px 11px',
                              fontSize: 11,
                            }}
                          >
                            <Icon name="android" style={{ width: 18, color: 'var(--a-green)', flex: 'none' }} />
                            <span style={{ minWidth: 0 }}>
                              <b style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{d.apkName}</b>
                              <span className="cell-sub" style={{ display: 'block' }}>
                                {fileSize(d.apkSize)} · {num(d.downloadCount)} downloads
                                {d.apkUploadedAt && ` · ${date(d.apkUploadedAt)}`}
                              </span>
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                          {d.webUrl && (
                            <a href={d.webUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                              <Icon name="external" /> Open
                            </a>
                          )}
                          {d.previewImages?.length > 0 ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() =>
                                setPreview({
                                  title: d.productName || d.title,
                                  images: d.previewImages.map((i) => i.url),
                                  captions: d.previewImages.map((i) => i.caption || ''),
                                })
                              }
                            >
                              <Icon name="eye" /> Preview
                            </button>
                          ) : (
                            d.reviewUrl && (
                              <a href={d.reviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                                <Icon name="eye" /> Preview
                              </a>
                            )
                          )}
                          {d.hasApk && (
                            <a
                              href={downloadUrl(`/account/downloads/demo/${d.id}/apk`)}
                              className="btn btn-outline btn-sm"
                            >
                              <Icon name="download" /> APK{d.apkVersion ? ` v${d.apkVersion}` : ''}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {preview && (
              <ImageSlider
                images={preview.images}
                captions={preview.captions}
                caption={preview.title}
                onClose={() => setPreview(null)}
              />
            )}

            <div className="panel">
              <div className="panel-body" style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                <span className="kpi-ic ic-blue" style={{ flex: 'none' }}><Icon name="info" /></span>
                <div>
                  <h3 style={{ fontSize: 13, marginBottom: 4 }}>Installing an Android build</h3>
                  <p style={{ margin: 0, fontSize: 12 }}>
                    Android blocks installs from outside the Play Store by default. After downloading the APK, open it
                    and allow <b>Install unknown apps</b> for your browser when prompted.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
