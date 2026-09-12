import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import Icon from './Icon';
import BrandMark from './BrandMark';
import { Avatar } from './ui';

/* Nav is grouped into sections so ten links read as a few short lists. */
const ACCOUNT_NAV = [
  {
    title: null,
    items: [{ to: '/account', end: true, icon: 'grid', label: 'Dashboard' }],
  },
  {
    title: 'Purchases',
    items: [
      { to: '/account/orders', icon: 'inbox', label: 'Orders' },
      { to: '/account/licenses', icon: 'key', label: 'Delivery & Licences' },
      { to: '/account/downloads', icon: 'download', label: 'Downloads' },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/account/support', icon: 'headset', label: 'Support' },
      { to: '/account/settings', icon: 'settings', label: 'Settings' },
    ],
  },
];

const ADMIN_NAV = [
  {
    title: null,
    items: [{ to: '/admin', end: true, icon: 'grid', label: 'Dashboard' }],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/products', icon: 'box', label: 'Products' },
      { to: '/admin/categories', icon: 'tag', label: 'Categories' },
      { to: '/admin/demos', icon: 'monitor', label: 'Demos & APK' },
      // leaves the console, so it is a plain link and never shows as the active page
      { to: '/', icon: 'external', label: 'View store', exit: true },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/admin/orders', icon: 'inbox', label: 'Orders', badge: 'pendingOrders' },
      { to: '/admin/customers', icon: 'users', label: 'Customers' },
      { to: '/admin/reports', icon: 'chart', label: 'Reports' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/messages', icon: 'mail', label: 'Messages', badge: 'newMessages' },
      { to: '/admin/email', icon: 'megaphone', label: 'Email' },
      { to: '/admin/roles', icon: 'lock', label: 'Roles' },
      { to: '/admin/settings', icon: 'settings', label: 'Settings' },
    ],
  },
];

/** Shell used by both the customer account and the admin console. */
export default function DashboardLayout({ variant = 'account', badges = {} }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { siteName, guessing } = useSettings();
  const navigate = useNavigate();

  const isAdmin = variant === 'admin';
  const nav = isAdmin ? ADMIN_NAV : ACCOUNT_NAV;

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="side-head">
          <Link to={isAdmin ? '/admin' : '/account'} className="brand" onClick={() => setOpen(false)}>
            <BrandMark name={siteName} />
            <span>
              <span className={`brand-name ${guessing ? 'is-guessing' : ''}`}>{siteName}</span>
              <span className="brand-tag">{isAdmin ? 'Admin Console' : 'My Account'}</span>
            </span>
          </Link>

          {/* only reachable once the drawer is open, so it lives inside it */}
          <button className="side-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <div className="side-scroll" onClick={() => setOpen(false)}>
          {nav.map((section, i) => (
            <div className="side-section" key={section.title || `top-${i}`}>
              {section.title && <div className="side-label">{section.title}</div>}
              <nav className="side-nav">
                {section.items.map((item) => {
                  const badgeValue = item.badge ? badges[item.badge] : 0;
                  if (item.exit) {
                    return (
                      <Link key={item.to} to={item.to} className="side-exit">
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  }
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {badgeValue > 0 && <span className="side-badge">{badgeValue}</span>}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* One compact block: the two utility links sit side by side rather than
            stacked, so the footer costs a row instead of most of the panel. */}
        <div className="side-foot">
          <div className="side-util">
            {!isAdmin && (
              <Link to="/" title="View store"><Icon name="external" /><span>View store</span></Link>
            )}
            <button className="side-signout" onClick={signOut} title="Sign out">
              <Icon name="logout" /><span>Sign out</span>
            </button>
          </div>

        </div>
      </aside>

      <div className="main">
        <Outlet context={{ toggleSidebar: () => setOpen((v) => !v) }} />
      </div>
    </div>
  );
}

/** Page header inside the dashboard shell. */
export function PageHeader({ title, subtitle, actions, onToggleSidebar }) {
  const { user } = useAuth();
  return (
    <header className="topbar">
      <button className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Menu">
        <Icon name="menu" />
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {/* The avatar sits outside topbar-right so that on a narrow screen the actions
          can drop to their own row while the identity stays up beside the title. */}
      {actions && <div className="topbar-right">{actions}</div>}
      <Avatar
        name={user?.name}
        email={user?.email}
        title={`${user?.name || ''}${user?.email ? ` (${user.email})` : ''}`}
      />
    </header>
  );
}
