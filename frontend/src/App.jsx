import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useReveal from './hooks/useReveal';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Loading } from './components/ui';

import StoreLayout from './components/StoreLayout';
import DashboardLayout from './components/DashboardLayout';

/* storefront */
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';
import Demos from './pages/Demos';
import About from './pages/About';
import Contact from './pages/Contact';
import StaticPage from './pages/StaticPage';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import Register from './pages/Register';

/* account */
import AccountShell from './pages/account/AccountShell';
import AccountDashboard from './pages/account/Dashboard';
import AccountOrders from './pages/account/Orders';
import AccountOrderDetail from './pages/account/OrderDetail';
import AccountLicenses from './pages/account/Licenses';
import AccountDownloads from './pages/account/Downloads';
import AccountSupport from './pages/account/Support';
import AccountSettings from './pages/account/Settings';

/* admin */
import AdminShell from './pages/admin/AdminShell';
import AdminDashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/Products';
import AdminProductFiles from './pages/admin/ProductFiles';
import AdminProductPackages from './pages/admin/ProductPackages';
import AdminAddonFiles from './pages/admin/AddonFiles';
import AdminPackageFiles from './pages/admin/PackageFiles';
import AdminOrders from './pages/admin/Orders';
import AdminCustomers from './pages/admin/Customers';
import AdminCategories from './pages/admin/Categories';
import AdminDemos from './pages/admin/Demos';
import AdminReports from './pages/admin/Reports';
import AdminMessages from './pages/admin/Messages';
import AdminEmail from './pages/admin/Email';
import AdminRoles from './pages/admin/Roles';
import AdminSettings from './pages/admin/Settings';

/** Blocks a route until the session is known, then redirects if not allowed. */
function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading variant="gate" label="Checking your session" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/account" replace />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * A focused <input type="number"> normally changes value when the wheel passes
 * over it, which silently edits prices and quantities while someone is just
 * scrolling. Blurring on wheel stops the edit and lets the page scroll on.
 */
function NumberInputWheelGuard() {
  useEffect(() => {
    const onWheel = (e) => {
      const el = document.activeElement;
      if (el && el.type === 'number' && el === e.target) el.blur();
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);
  return null;
}

export default function App() {
  useReveal();
  return (
    <>
      <ScrollToTop />
      <NumberInputWheelGuard />
      <Routes>
        {/* ---------- storefront ---------- */}
        <Route element={<StoreLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order/:number" element={<OrderSuccess />} />
          <Route path="/demos" element={<Demos />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms" element={<StaticPage page="terms" />} />
          <Route path="/privacy" element={<StaticPage page="privacy" />} />
          <Route path="/status" element={<StaticPage page="status" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* ---------- customer account ---------- */}
        <Route
          path="/account"
          element={
            <Protected>
              <AccountShell />
            </Protected>
          }
        >
          <Route index element={<AccountDashboard />} />
          <Route path="orders" element={<AccountOrders />} />
          <Route path="orders/:number" element={<AccountOrderDetail />} />
          <Route path="licenses" element={<AccountLicenses />} />
          <Route path="downloads" element={<AccountDownloads />} />
          <Route path="support" element={<AccountSupport />} />
          <Route path="settings" element={<AccountSettings />} />
        </Route>

        {/* ---------- admin ---------- */}
        <Route
          path="/admin"
          element={
            <Protected adminOnly>
              <AdminShell />
            </Protected>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/:id/files" element={<AdminProductFiles />} />
          <Route path="products/:id/packages" element={<AdminProductPackages />} />
          <Route path="addons/:addonId/files" element={<AdminAddonFiles />} />
          <Route path="packages/:packageId/files" element={<AdminPackageFiles />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="demos" element={<AdminDemos />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="email" element={<AdminEmail />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </>
  );
}
