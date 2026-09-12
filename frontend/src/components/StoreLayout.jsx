import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';
import BrandMark from './BrandMark';
import CartDrawer from './CartDrawer';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';

function Brand({ tagline }) {
  // both come from Settings -> General, so renaming the store is a settings change
  const { siteName, tagline: defaultTagline, guessing } = useSettings();
  return (
    <Link to="/" className="brand">
      <BrandMark name={siteName} />
      <span>
        <span className={`brand-name ${guessing ? 'is-guessing' : ''}`}>{siteName}</span>
        <span className="brand-tag">{tagline ?? defaultTagline}</span>
      </span>
    </Link>
  );
}

function Footer() {
  const toast = useToast();
  const { siteName } = useSettings();
  const [email, setEmail] = useState('');

  const subscribe = async (e) => {
    e.preventDefault();
    try {
      await api.post('/shop/subscribe', { email });
      toast.ok('Subscribed - watch your inbox.');
      setEmail('');
    } catch (err) {
      toast.fail(err.message);
    }
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Brand />
            <div className="socials">
              <a href="#" aria-label="Facebook">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.24-1.5 1.5-1.5h1.7V3.9c-.3-.04-1.3-.13-2.47-.13-2.45 0-4.13 1.5-4.13 4.24V10H7.4v3h2.7v8h3.4Z" /></svg>
              </a>
              <a href="#" aria-label="X">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3l-6.6 7.5L21.7 21h-6l-4.3-5.6L6.4 21H3.3l7-8L2.6 3h6.2l3.9 5.2L17.5 3Zm-1.1 16.2h1.7L7.7 4.7H5.9l10.5 14.5Z" /></svg>
              </a>
              <a href="#" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.94 8.5V21H3.3V8.5h3.64Zm.23-3.44c0 1.05-.79 1.9-2.05 1.9h-.02c-1.21 0-2-.85-2-1.9 0-1.08.81-1.9 2.05-1.9 1.23 0 2 .82 2.02 1.9ZM21 21h-3.64v-6.68c0-1.68-.6-2.82-2.1-2.82-1.15 0-1.83.77-2.13 1.51-.11.27-.14.64-.14 1.01V21H9.35s.05-11.33 0-12.5h3.64v1.77c.48-.75 1.35-1.81 3.29-1.81 2.4 0 4.2 1.57 4.2 4.94V21Z" /></svg>
              </a>
              <a href="#" aria-label="YouTube">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2s-.2-1.4-.8-2c-.76-.8-1.6-.8-2-.85C16 4.2 12 4.2 12 4.2h-.01s-4 0-6.8.2c-.4.05-1.24.05-2 .85-.6.6-.8 2-.8 2S2.2 8.8 2.2 10.4v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.76.8 1.76.77 2.2.86 1.6.15 6.8.2 6.8.2s4 0 6.8-.21c.4-.05 1.24-.05 2-.85.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5c0-1.6-.2-3.2-.2-3.2ZM9.9 13.9V8.6l5.2 2.66-5.2 2.64Z" /></svg>
              </a>
            </div>
          </div>

          <div>
            <h5>Shop</h5>
            <ul>
              <li><Link to="/products">All products</Link></li>
              <li><Link to="/products?category=productivity">Productivity</Link></li>
              <li><Link to="/products?category=security">Security</Link></li>
              <li><Link to="/products?category=design-creative">Design</Link></li>
              <li><Link to="/demos">Demos</Link></li>
            </ul>
          </div>

          <div>
            <h5>Support</h5>
            <ul>
              <li><Link to="/contact">Help Center</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/status">Status</Link></li>
              <li><Link to="/account">My Account</Link></li>
            </ul>
          </div>

          <div className="footer-sub">
            <h5>Subscribe to our newsletter</h5>
            <p>Get the latest deals and new releases.</p>
            <form className="sub-form" onSubmit={subscribe}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
              />
              <button type="submit">Subscribe</button>
            </form>
          </div>
        </div>

        <div className="footer-bar">
          <span>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</span>
          <span>Built with &#10084; for a smarter tomorrow.</span>
        </div>
      </div>
    </footer>
  );
}

export default function StoreLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { count } = useCart();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const submitSearch = (e) => {
    if (e) e.preventDefault();
    navigate(search.trim() ? `/products?q=${encodeURIComponent(search.trim())}` : '/products');
    setSearch('');
    setSearchOpen(false);
  };

  return (
    <>
      <div className="topstrip">
        <div className="container topstrip-inner">
          <span className="topstrip-item"><Icon name="shield" /> Secure Payment</span>
          <span className="topstrip-item"><Icon name="bolt" /> Instant Delivery</span>
          <span className="topstrip-item"><Icon name="headset" /> 24/7 Support</span>
        </div>
      </div>

      <nav className="nav">
        <div className="container nav-inner">
          <button
            className="nav-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>

          <Brand />

          <div className={`nav-links ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
            <form
              className="nav-links-search"
              onSubmit={(e) => {
                submitSearch(e);
                setMenuOpen(false);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="search" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search software..."
                aria-label="Search products"
              />
            </form>

            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/products">Products</NavLink>
            <NavLink to="/demos">Demos</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/contact">Contact</NavLink>
          </div>

          <div className="nav-right">
            {searchOpen && (
              <form onSubmit={submitSearch} className="nav-search">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search software..."
                  aria-label="Search products"
                  autoFocus
                  onBlur={() => !search && setSearchOpen(false)}
                />
              </form>
            )}

            <button
              className="nav-icon"
              onClick={() => (searchOpen ? submitSearch() : setSearchOpen(true))}
              aria-label="Search"
            >
              <Icon name="search" />
            </button>

            <button className="nav-icon" onClick={() => setCartOpen(true)} aria-label="Cart">
              <Icon name="cart" />
              {count > 0 && <span className="cart-badge">{count}</span>}
            </button>

            {user ? (
              <Link to={isAdmin ? '/admin' : '/account'} className="btn btn-primary btn-sm">
                <Icon name="user" /> {isAdmin ? 'Admin' : 'My Account'}
              </Link>
            ) : (
              // One door in. "Sign in" / "Sign up" side by side read as the same
              // word; the sign-in page already offers "Create one free" underneath.
              <Link to="/login" className="btn btn-primary btn-sm">
                <Icon name="user" /> Sign in
              </Link>
            )}

          </div>
        </div>
      </nav>

      <main style={{ minHeight: '60vh' }}>
        <Outlet context={{ openCart: () => setCartOpen(true) }} />
      </main>

      <Footer />

      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
    </>
  );
}

export { Brand };
