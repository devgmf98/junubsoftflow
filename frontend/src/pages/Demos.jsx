import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { downloadUrl, assetUrl } from '../api/client';
import Icon from '../components/Icon';
import ImageSlider from '../components/ImageSlider';
import { Loading, Alert, Empty } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  fileSize, date, num, accentStyle, platformLabel, platformIcon, platformAccent, attachedBuilds,
} from '../utils/format';
import usePageMeta from '../hooks/usePageMeta';

/** Public demos: web review links and downloadable Android builds. */
export default function Demos() {
  usePageMeta({
    title: 'Live demos and Android builds',
    description:
      'Try the software before you buy. Open a live web demo, or install the Android or iOS build on a test device.',
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
          <p>Open a live demo in your browser, or install the mobile build on a test device.</p>
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
          <div className="product-grid demo-grid">
            {demos.map((d) => {
              // the product's own picture first; failing that one of its screenshots.
              // A demo need not belong to a product, hence the platform panel below.
              const cover = d.productImage || d.previewImages?.[0]?.url || null;
              const builds = attachedBuilds(d);

              return (
              <article className="demo-card" key={d.id}>
                <div className={`demo-cover${cover ? '' : ' is-blank'}`}>
                  {cover ? (
                    <img src={assetUrl(cover)} alt={d.productName || d.title} loading="lazy" />
                  ) : (
                    <span className="demo-cover-icon" style={accentStyle(platformAccent(d.platform))}>
                      <Icon name={platformIcon(d.platform)} />
                    </span>
                  )}
                  <span className="demo-tag">
                    <Icon name={platformIcon(d.platform)} /> {platformLabel(d.platform)}
                  </span>
                  {builds.map((b, i) => (
                    <span
                      key={b.os}
                      className="demo-tag demo-tag-apk"
                      /* stacked down the corner when a demo ships on both stores */
                      style={i ? { top: 42 } : undefined}
                    >
                      <Icon name={b.icon} /> {b.format}
                    </span>
                  ))}
                </div>

                <div className="demo-body">
                <h3>{d.title}</h3>
                {d.productName && (
                  <div className="demo-owner">
                    <Icon name="box" /> {d.productName}
                  </div>
                )}
                {d.description && <p className="desc">{d.description}</p>}

                {builds.map((b) => (
                  <div className="demo-apk" key={b.os}>
                    <Icon name={b.icon} />
                    <span style={{ minWidth: 0 }}>
                      <b>{b.name}</b>
                      <em>
                        {b.version && `v${b.version} · `}
                        {fileSize(b.size)}
                        {b.uploadedAt && ` · ${date(b.uploadedAt)}`}
                      </em>
                    </span>
                  </div>
                ))}

                <div className="demo-actions">
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
                  {builds.map((b) => (
                    <a
                      key={b.os}
                      href={downloadUrl(`/shop/demos/${d.id}/${b.path}`)}
                      className="btn btn-outline btn-sm"
                    >
                      <Icon name="download" /> {b.format}{b.version ? ` v${b.version}` : ''}
                    </a>
                  ))}
                  {!d.webUrl && !d.reviewUrl && !builds.length && !d.previewImages?.length && (
                    <span className="cell-sub">Links coming soon.</span>
                  )}
                </div>
                </div>
              </article>
              );
            })}
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
              <h3 style={{ fontSize: 13.5, marginBottom: 4 }}>Installing a mobile build</h3>
              {demos.some((d) => d.hasApk) && (
                <p style={{ margin: 0, fontSize: 12 }}>
                  <b>Android.</b> The Play Store is bypassed here, so after downloading the APK, open it and allow{' '}
                  <b>Install unknown apps</b> for your browser when prompted.
                </p>
              )}
              {demos.some((d) => d.hasIpa) && (
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                  <b>iOS.</b> An .ipa cannot be installed from Safari. Open the demo link for a TestFlight invite, or
                  ask us to add your device to the provisioning profile.
                </p>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                These are pre-release builds meant for testing, so use a test device rather than a production phone.
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
