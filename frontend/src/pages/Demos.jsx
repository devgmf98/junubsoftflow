import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { downloadUrl } from '../api/client';
import Icon from '../components/Icon';
import ImageSlider from '../components/ImageSlider';
import { Loading, Alert, Empty } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { fileSize, date, num, accentStyle, platformLabel, platformIcon, platformAccent } from '../utils/format';
import usePageMeta from '../hooks/usePageMeta';

/** Public demos: web review links and downloadable Android builds. */
export default function Demos() {
  usePageMeta({
    title: 'Live demos and Android builds',
    description:
      'Try the software before you buy. Open a live web demo or install the Android build on a test device.',
    path: '/demos',
  });

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { images, captions, title }
  const [params] = useSearchParams();
  const { user } = useAuth();

  // ?product=<slug> narrows the page to one product's demos
  const productSlug = params.get('product') || '';

  useEffect(() => {
    setData(null);
    const q = productSlug ? `?product=${encodeURIComponent(productSlug)}` : '';
    api.get(`/shop/demos${q}`).then(setData).catch((e) => setError(e.message));
  }, [productSlug]);

  if (error) return <div className="container section"><Alert type="error">{error}</Alert></div>;
  if (!data) return <Loading variant="grid" />;

  const demos = data.demos;
  const product = data.product;
  const filtered = Boolean(productSlug);

  return (
    <section className="section">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link> <span>/</span>
          {product ? (
            <>
              <Link to="/demos">Demos</Link> <span>/</span> <span>{product.name}</span>
            </>
          ) : (
            <span>Demos</span>
          )}
        </div>

        <div className="section-head section-head-center" data-reveal>
          <h2>{product ? `${product.name} demo` : 'See it before you buy it'}</h2>
          <p>Open a live demo in your browser, or install the Android build on a test device.</p>
        </div>

        {filtered && (
          <div className="demo-filter">
            <Icon name="filter" />
            <span>
              Showing {demos.length} demo{demos.length === 1 ? '' : 's'}
              {product ? ` for ${product.name}` : ''} of {num(data.total)} published
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {product && (
                <Link to={`/products/${product.slug}`} className="btn btn-outline btn-sm">
                  Back to {product.name}
                </Link>
              )}
              <Link to="/demos" className="btn btn-ghost btn-sm">Show all demos</Link>
            </span>
          </div>
        )}

        {!demos.length ? (
          <div className="panel">
            <div className="panel-body">
              <Empty
                icon="monitor"
                action={filtered ? <Link to="/demos" className="btn btn-primary btn-sm">Show all demos</Link> : null}
              >
                {filtered
                  ? `No demo has been published for ${product ? product.name : 'that product'} yet.`
                  : 'No demos are available right now.'}
              </Empty>
            </div>
          </div>
        ) : (
          <div className="product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {demos.map((d) => (
              <div className="product-card" key={d.id} style={{ padding: 20 }}>
                <span
                  className="kpi-ic"
                  style={{ ...accentStyle(platformAccent(d.platform)), width: 44, height: 44, borderRadius: 12 }}
                >
                  <Icon name={platformIcon(d.platform)} />
                </span>

                <h3 style={{ marginTop: 8 }}>{d.title}</h3>
                <div className="cell-sub">
                  {platformLabel(d.platform)}
                  {d.productName && ` · ${d.productName}`}
                </div>
                {d.description && <p className="desc">{d.description}</p>}

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

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 12 }}>
                  {d.webUrl && (
                    <a href={d.webUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                      <Icon name="external" /> Open demo
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
                    // no screenshots uploaded yet - fall back to the hosted review page
                    d.reviewUrl && (
                      <a href={d.reviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                        <Icon name="eye" /> Preview
                      </a>
                    )
                  )}
                  {d.hasApk && (
                    <a href={downloadUrl(`/shop/demos/${d.id}/apk`)} className="btn btn-outline btn-sm">
                      <Icon name="download" /> APK{d.apkVersion ? ` v${d.apkVersion}` : ''}
                    </a>
                  )}
                  {!d.webUrl && !d.reviewUrl && !d.hasApk && !d.previewImages?.length && (
                    <span className="cell-sub">Links coming soon.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {preview && (
          <ImageSlider
            images={preview.images}
            captions={preview.captions}
            caption={preview.title}
            onClose={() => setPreview(null)}
          />
        )}

        <div className="panel" style={{ marginTop: 24 }}>
          <div className="panel-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span className="kpi-ic ic-blue" style={{ flex: 'none' }}><Icon name="info" /></span>
            <div style={{ flex: 1, minWidth: 250 }}>
              <h3 style={{ fontSize: 13.5, marginBottom: 4 }}>Installing an Android build</h3>
              <p style={{ margin: 0, fontSize: 12 }}>
                Android blocks installs from outside the Play Store by default. After downloading the APK, open it and
                allow <b>Install unknown apps</b> for your browser when prompted. These are pre-release builds meant for
                testing, so install them on a test device rather than a production phone.
              </p>
            </div>
            {!user && (
              <Link to="/register" className="btn btn-primary btn-sm">Create free account</Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
