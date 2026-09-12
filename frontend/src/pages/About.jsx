import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Icon from '../components/Icon';
import { num } from '../utils/format';
import usePageMeta from '../hooks/usePageMeta';

const VALUES = [
  ['shield', 'blue', 'Genuine licences', 'Every key comes from the publisher or an authorised distributor. No grey-market resellers, no keys that stop working after an audit.'],
  ['bolt', 'orange', 'Instant delivery', 'Keys are issued the second payment clears - not in an hour, not on the next business day. Downloads unlock at the same moment.'],
  ['headset', 'green', 'Real support', 'The people who run the store answer the tickets. You are not routed through a queue to reach someone who can actually help.'],
  ['refresh', 'purple', 'Fair returns', 'An unused key can be refunded within fourteen days. If the licence never left your account, it never cost you anything.'],
];

const STEPS = [
  ['Pick a licence', 'Browse a small, deliberately curated catalogue. Every listing shows the licence term and the platforms it covers before you commit.'],
  ['Pay your way', 'Card, PayPal, mobile money, bank transfer or cash on collection. Deferred methods hold the order until the payment is confirmed.'],
  ['Download and activate', 'Your key and installers appear under your account immediately, and stay there for as long as the licence is valid.'],
];

const PRINCIPLES = [
  ['box', 'We only sell what we can source properly.', 'If a licence cannot be obtained through a legitimate channel, it does not get listed. That is why the catalogue is deliberately small.'],
  ['money', 'Prices are published, not negotiated.', 'What you see on the product page is what you pay, whether you buy one licence or twenty. No quote forms, no haggling.'],
  ['key', 'Your keys stay available.', 'Sign in any time to re-read a licence key or re-download an installer. Losing an email should never cost you a licence.'],
];

export default function About() {
  usePageMeta({
    title: 'About us',
    description:
      'Why JunubSoftFlow sells only genuine licences, publishes its prices, and keeps your keys available for as long as they are valid.',
    path: '/about',
  });

  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/shop/home')
      .then((d) => {
        const products = d.categories.reduce((s, c) => s + c.productCount, 0);
        setStats({ products, categories: d.categories.length });
      })
      .catch(() => setStats(null));
  }, []);

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="about-hero">
        <div className="container">
          <div className="about-hero-inner">
            <span className="about-eyebrow" data-reveal="fade">
              <Icon name="bolt" /> About SoftFlow
            </span>
            <h1 data-reveal style={{ '--d': '60ms' }}>
              Software you can trust,
              <br />
              at a price that makes sense
            </h1>
            <p className="about-lead" data-reveal style={{ '--d': '140ms' }}>
              We sell genuine software licences and deliver them the moment you pay - no waiting on a reseller,
              no surprises at renewal.
            </p>
            <div className="about-cta" data-reveal style={{ '--d': '220ms' }}>
              <Link to="/products" className="btn btn-primary btn-lg">Browse the catalogue</Link>
              <Link to="/demos" className="btn btn-outline btn-lg">See a demo first</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- the numbers ---------- */}
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="container">
          <div className="about-stats" data-reveal="zoom">
            <div className="about-stat">
              <span className="about-stat-v">{stats ? num(stats.products) : '-'}</span>
              <span className="about-stat-k">Licences in the catalogue</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-v">{stats ? num(stats.categories) : '-'}</span>
              <span className="about-stat-k">Software categories</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-v">Instant</span>
              <span className="about-stat-k">Licence delivery</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-v">99.9%</span>
              <span className="about-stat-k">Storefront uptime</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- what you get ---------- */}
      <section className="section">
        <div className="container">
          <div className="section-head section-head-center" data-reveal>
            <h2>What you get, every time</h2>
            <p>Four things we will not compromise on, whatever the order is worth.</p>
          </div>

          <div className="about-values">
            {VALUES.map(([icon, accent, title, text], i) => (
              <article className="about-value" key={title} data-reveal style={{ '--d': `${i * 90}ms` }}>
                <span className={`kpi-ic ic-${accent}`}><Icon name={icon} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- how buying works ---------- */}
      <section className="section section-soft">
        <div className="container">
          <div className="section-head section-head-center" data-reveal>
            <h2>How buying works</h2>
            <p>Three steps, and the third one happens on its own.</p>
          </div>

          <ol className="about-steps">
            {STEPS.map(([title, text], i) => (
              <li className="about-step" key={title} data-reveal style={{ '--d': `${i * 110}ms` }}>
                <span className="about-step-n">{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- principles ---------- */}
      <section className="section">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="section-head section-head-center" data-reveal>
            <h2>How we work</h2>
          </div>

          <div className="about-principles">
            {PRINCIPLES.map(([icon, title, text], i) => (
              <div className="about-principle" key={title} data-reveal="left" style={{ '--d': `${i * 100}ms` }}>
                <span className="about-principle-ic"><Icon name={icon} /></span>
                <div>
                  <b>{title}</b>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- closing ---------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="about-close" data-reveal="zoom">
            <div>
              <h2>Ready when you are</h2>
              <p>Pick a licence, pay however suits you, and download straight away.</p>
            </div>
            <div className="about-close-actions">
              <Link to="/products" className="btn btn-primary btn-lg">Browse the catalogue</Link>
              <Link to="/contact" className="btn btn-ghost btn-lg">Talk to us first</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
