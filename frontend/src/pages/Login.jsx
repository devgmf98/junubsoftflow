import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import Icon from '../components/Icon';
import { Alert } from '../components/ui';
import usePageMeta from '../hooks/usePageMeta';

export default function Login() {
  usePageMeta({
    title: 'Sign in',
    description:
      'Sign in to your JunubSoftFlow account to see your orders, licence keys and downloads in one place.',
    path: '/login',
  });

  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form.email, form.password);
      const from = location.state?.from;
      // a shopper mid-purchase goes back to checkout
      const dest = from || (user.role === 'admin' ? '/admin' : count > 0 ? '/checkout' : '/account');
      toast.ok(`Welcome back, ${user.name.split(' ')[0]}.`);
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <h2>Welcome back.<br />Your licences are waiting.</h2>
        <p>Sign in to see your orders, licence keys and downloads in one place.</p>
        <ul className="auth-points">
          <li><span className="check-dot"><Icon name="check" /></span> Every licence key you have bought</li>
          <li><span className="check-dot"><Icon name="check" /></span> Installers and mobile builds</li>
          <li><span className="check-dot"><Icon name="check" /></span> Support tickets and order history</li>
        </ul>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>Sign in</h1>
          <p>Welcome back to SoftFlow.</p>

          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@company.com"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="auth-foot">
            Don&apos;t have an account? <Link to="/register">Create one free</Link>
          </div>

          <div className="demo-note">
            <b>Demo accounts</b><br />
            Admin &middot; <code>admin@softflow.com</code> / <code>admin123</code><br />
            Customer &middot; <code>john@example.com</code> / <code>user123</code>
          </div>
        </div>
      </main>
    </div>
  );
}
