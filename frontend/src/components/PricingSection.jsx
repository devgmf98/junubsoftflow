import { useState, useMemo } from 'react';
import Icon from './Icon';
import { money, num } from '../utils/format';

const TYPE_LABEL = { regular: 'Regular', extended: 'Extended', agency: 'Agency' };
const LICENSE_TITLE = {
  regular: 'Regular License',
  extended: 'Extended License',
  agency: 'Agency License',
};

/** A price rendered with a small leading $ , as on the reference cards. */
function Price({ value }) {
  return (
    <span className="pkg-price">
      <span className="cur">$</span>
      {Number(value).toLocaleString('en-US')}
    </span>
  );
}

function TickList({ rows, dark }) {
  return (
    <ul className="pkg-list">
      {rows.map((r, i) => (
        <li key={i} className={r.included ? '' : 'off'}>
          <span className={`pkg-tick ${dark ? 'on-dark' : ''}`}>
            <Icon name={r.included ? 'check' : 'alert'} />
          </span>
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

function PackageCard({ pkg, onBuy, busy }) {
  const dark = pkg.isPopular;
  return (
    <div className={`pkg-card ${dark ? 'popular' : ''}`}>
      {dark && <span className="pkg-badge">&#9733; MOST POPULAR</span>}

      <Price value={pkg.price} />

      {pkg.comparePrice > pkg.price && (
        <div className="pkg-compare">
          <s>{money(pkg.comparePrice, false)}</s>
          {pkg.savePercent > 0 && <span className="pkg-save">SAVE {pkg.savePercent}%</span>}
        </div>
      )}

      {pkg.perLicense && (
        <div className="pkg-per">
          <b>{money(pkg.perLicense, false)}</b> per license &middot; {num(pkg.licenseCount)} licenses
        </div>
      )}

      <h3 className="pkg-name">{pkg.name}</h3>
      {pkg.tagline && <p className="pkg-tagline">{pkg.tagline}</p>}

      {pkg.included.length > 0 && (
        <>
          {pkg.licenseCount > 1 && <div className="pkg-divider-label">Included on every license</div>}
          <TickList rows={pkg.included} dark={dark} />
        </>
      )}

      {pkg.addons.length > 0 && (
        <>
          <div className="pkg-divider">&ndash; PREMIUM ADD-ONS INCLUDED &ndash;</div>
          <TickList rows={pkg.addons} dark={dark} />
        </>
      )}

      {pkg.benefits.length > 0 && (
        <>
          <div className="pkg-divider">&ndash; AGENCY BENEFITS &ndash;</div>
          <TickList rows={pkg.benefits} dark={dark} />
        </>
      )}

      <button className="pkg-buy" onClick={() => onBuy(pkg)} disabled={busy}>
        {pkg.ctaLabel || 'Buy Now'} {dark && <span aria-hidden="true">&rarr;</span>}
      </button>
    </div>
  );
}

export default function PricingSection({ pricing, onBuyPackage, onBuyAddon, busy }) {
  const types = pricing?.licenseTypes || [];
  const [type, setType] = useState(types[0] || 'regular');

  const packages = useMemo(
    () => (pricing?.packages || []).filter((p) => p.licenseType === type),
    [pricing, type]
  );

  if (!types.length) return null;

  const matrix = pricing.matrix || [];
  const addons = pricing.addons || [];

  return (
    <>
      {/* ---------- packages ---------- */}
      <section className="pricing-band">
        <div className="container">
          <div className="pricing-band-head">
            <h2>Choose your package</h2>
            <p>
              Every package includes both regular and extended licence types for flexible usage and growth.
            </p>
          </div>

          {types.length > 1 && (
            <div className="license-switch" role="tablist" aria-label="License type">
              {types.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={type === t}
                  className={type === t ? 'on' : ''}
                  onClick={() => setType(t)}
                >
                  {TYPE_LABEL[t] || t}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section pricing-cards-band">
        <div className="container">
          <div className="pkg-grid">
            {packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} onBuy={onBuyPackage} busy={busy} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- which licence ---------- */}
      {matrix.length > 0 && (
        <section className="section section-soft">
          <div className="container">
            <div className="section-head section-head-center">
              <div className="eyebrow-label">LICENSE TYPE</div>
              <h2>
                Which License to <span className="hl-green">Purchase</span>?
              </h2>
              <p>
                Select the license that fits your business or project&apos;s goal, serves your customers, and
                gives you greater value.
              </p>
            </div>

            <div className="license-grid">
              {matrix.map((m) => {
                const recommended = m.licenseType === 'extended';
                return (
                  <div key={m.licenseType} className={`license-card ${recommended ? 'recommended' : ''}`}>
                    <div className="license-card-head">
                      <h3>{LICENSE_TITLE[m.licenseType]}</h3>
                      {recommended && <span className="license-flag">RECOMMENDED</span>}
                    </div>
                    <ul className="license-rows">
                      {m.rows.map((r, i) => (
                        <li key={i} className={r.included ? '' : 'off'}>
                          <Icon name={r.included ? 'check' : 'close'} />
                          <span>{r.label}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      className={`btn ${recommended ? 'btn-dark' : 'btn-outline'} btn-block`}
                      onClick={() => {
                        const match = (pricing.packages || []).find(
                          (p) => p.licenseType === m.licenseType && p.isPopular
                        );
                        if (match) onBuyPackage(match);
                        else setType(m.licenseType);
                      }}
                    >
                      Buy {LICENSE_TITLE[m.licenseType]}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---------- add-ons ---------- */}
      {addons.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head section-head-center">
              <div className="eyebrow-label">ADDONS PRICING</div>
              <h2>
                Pricing for <span className="hl-green">Premium Addons</span>
              </h2>
              <p>Choose our best-selling premium addons for smoother business operations and better user journeys.</p>
            </div>

            <div className="addon-table">
              <div className="addon-head">
                <span />
                <span>REGULAR LICENSE</span>
                <span>EXTENDED LICENSE</span>
              </div>

              {addons.map((a) => (
                <div className="addon-row" key={a.id}>
                  <div className="addon-name">
                    <b>{a.name}</b>
                    {a.description && <span className="cell-sub">{a.description}</span>}
                  </div>

                  <div className="addon-cell">
                    {a.regularPrice === null ? (
                      <span className="cell-sub">&mdash;</span>
                    ) : (
                      <>
                        <b>{money(a.regularPrice, false)}</b>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => onBuyAddon(a, 'regular')}
                          disabled={busy}
                        >
                          Buy Regular License
                        </button>
                      </>
                    )}
                  </div>

                  <div className="addon-cell highlight">
                    {a.extendedPrice === null ? (
                      <span className="cell-sub">&mdash;</span>
                    ) : (
                      <>
                        <b>{money(a.extendedPrice, false)}</b>
                        <button
                          className="btn btn-green btn-sm"
                          onClick={() => onBuyAddon(a, 'extended')}
                          disabled={busy}
                        >
                          Buy Extended License
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
