import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Icon from '../components/Icon';
import { useSettings } from '../context/SettingsContext';
import ProductCard from '../components/ProductCard';
import DealCard from '../components/DealCard';
import { Loading, Alert } from '../components/ui';
import { useCart } from '../context/CartContext';
import { accentStyle, num } from '../utils/format';
import usePageMeta from '../hooks/usePageMeta';

export default function Home() {
  const { siteName } = useSettings();
  usePageMeta({
    // no title: the home page is the store, so the tab shows the site name alone
    description:
      'Buy genuine software licences online and get your keys the moment you pay. Productivity, security, design and business software with instant delivery and real support.',
    path: '/',
  });

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [term, setTerm] = useState('');
  const [added, setAdded] = useState('');
  const { add } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/shop/home').then(setData).catch((e) => setError(e.message));
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    navigate(`/products?q=${encodeURIComponent(term.trim())}`);
  };

  const onAdd = (product) => {
    add({ productId: product.id }, 1);
    setAdded(`${product.name} was added to your cart.`);
    window.setTimeout(() => setAdded(''), 3000);
  };

  if (error) return <div className="container section"><Alert type="error">{error}</Alert></div>;
  if (!data) return <Loading variant="dashboard" />;

  const s = data.settings || {};

  return (
    <>
      {/* ---------- 1. hero ---------- */}
      <section className="hero">
        <div className="container">
          <div className="hero-inner">
            <h1 data-reveal>
              The Right Software<br />
              for Your Business <span className="hl">Growth</span>
            </h1>
            <p className="hero-sub" data-reveal style={{ '--d': '80ms' }}>
              {s.hero_subtitle || 'Powerful. Secure. Scalable'}
            </p>

            <form className="hero-search" onSubmit={onSearch} data-reveal style={{ '--d': '160ms' }}>
              <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search for software, e.g. Antivirus, Office..."
                aria-label="Search products"
              />
              <button type="submit" aria-label="Search"><Icon name="search" /></button>
            </form>

            <div className="cat-tiles">
              {data.categories.map((c, i) => (
                <Link
                  key={c.id}
                  to={`/products?category=${c.slug}`}
                  className="cat-tile"
                  data-reveal
                  style={{ '--d': `${200 + Math.min(i, 4) * 55}ms` }}
                >
                  <span className="ic" style={accentStyle(c.accent)}><Icon name={c.icon} /></span>
                  <span className="tx">
                    <span className="nm">{c.name}</span>
                    <span className="ct">
                      {num(c.productCount)} {c.productCount === 1 ? 'title' : 'titles'}
                    </span>
                  </span>
                  <Icon name="arrowRight" className="go" />
                </Link>
              ))}
            </div>
          </div>

        </div>
      </section>

      {added && (
        <div className="container" style={{ paddingTop: 18 }}>
          <Alert type="success" onClose={() => setAdded('')}>{added}</Alert>
        </div>
      )}

      {/* ---------- 2. big deal offers ---------- */}
      {/* only rendered when something is actually discounted - an empty "deals" row
          advertising nothing is worse than no row at all */}
      {data.deals?.length > 0 && (
        <section className="section section-deals">
          <div className="container">
            <div className="section-head" data-reveal>
              <div>
                <h2>
                  <span className="deals-flame"><Icon name="tag" /></span>
                  Big Deal Offers
                </h2>
                <p>
                  Limited-time prices. What you see here is what the cart charges - the
                  payment-method discount is not added on top.
                </p>
              </div>
              <div className="right">
                <Link to="/products" className="btn btn-outline btn-sm">
                  View all <Icon name="arrowRight" />
                </Link>
              </div>
            </div>
            <div className="deal-grid">
              {data.deals.map((p, i) => (
                <DealCard key={p.id} product={p} onAdd={onAdd} revealDelay={i * 80} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- 3. featured ---------- */}
      <section className="section">
        <div className="container">
          <div className="section-head" data-reveal>
            <div>
              <h2>Popular Software</h2>
              <p>Best-selling licences, delivered to your inbox within minutes.</p>
            </div>
            <div className="right">
              <Link to="/products" className="btn btn-outline btn-sm">
                View all <Icon name="arrowRight" />
              </Link>
            </div>
          </div>
          <div className="product-grid">
            {/* hideOffer: a discounted title still belongs here as a best-seller, but the
                offer itself is announced once, in Big Deal Offers above */}
            {data.featured.map((p, i) => (
              <ProductCard key={p.id} product={p} onAdd={onAdd} revealDelay={i * 80} hideOffer />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- why buy here ---------- */}
      <section className="section section-soft why-section">
        <div className="container">
          <div className="section-head section-head-center" data-reveal>
            {/* the store's own name, from Settings -> General */}
            <h2>Why buy from {siteName}</h2>
            <p>Genuine licences, instant delivery, and people you can actually reach.</p>
          </div>

          <div className="why-grid">
            {[
              ['shield', 'green', 'Secure Payment', 'Card, PayPal, mobile money and bank transfer, all processed securely.'],
              ['bolt', 'blue', 'Instant Delivery', 'Licence keys are issued the moment your payment clears.'],
              ['headset', 'purple', '24/7 Support', 'Real people answer support tickets, around the clock.'],
              ['refresh', 'orange', '14-Day Returns', 'Unused keys can be refunded within fourteen days, no quibbles.'],
            ].map(([icon, accent, title, text], i) => (
              <div className="why-card" key={title} style={{ '--d': `${i * 90}ms` }} data-reveal>
                {/* icon and step number share one row, so they line up by construction
                    rather than by two guessed offsets */}
                <div className="why-head">
                  <span className="why-ic" style={accentStyle(accent)}>
                    <Icon name={icon} />
                  </span>
                  <span className="why-num">{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- new arrivals ---------- */}
      <section className="section">
        <div className="container">
          <div className="section-head" data-reveal>
            <div>
              <h2>New Arrivals</h2>
              <p>The latest additions to the catalogue.</p>
            </div>
            <div className="right">
              <Link to="/products?sort=newest" className="btn btn-outline btn-sm">
                Browse all <Icon name="arrowRight" />
              </Link>
            </div>
          </div>
          <div className="product-grid">
            {data.newest.map((p, i) => (
              <ProductCard key={p.id} product={p} onAdd={onAdd} revealDelay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- closing CTA ---------- */}
      <section className="section cta-section">
        <div className="container">
          <div className="cta-band" data-reveal="zoom">
            <span className="cta-icon"><Icon name="headset" /></span>

            <h2>Not sure which licence you need?</h2>
            <p>
              Try a live demo first, or ask our team - we will point you at the right edition
              rather than the dearest one.
            </p>

            <div className="cta-actions">
              <Link to="/demos" className="btn btn-lg cta-primary">
                <Icon name="monitor" /> View demos
              </Link>
              <Link to="/contact" className="btn btn-lg cta-ghost">
                <Icon name="mail" /> Talk to us
              </Link>
            </div>

            {/* the three things someone hesitating actually wants to know */}
            <ul className="cta-points">
              <li><Icon name="check" /> Replies within one business day</li>
              <li><Icon name="check" /> Try before you buy, no account needed</li>
              <li><Icon name="check" /> Genuine licences, refundable if unused</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
