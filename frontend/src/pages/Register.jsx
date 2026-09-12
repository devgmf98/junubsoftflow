import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import Icon from '../components/Icon';
import { Alert } from '../components/ui';
import usePageMeta from '../hooks/usePageMeta';

export default function Register() {
  usePageMeta({
    title: 'Create an account',
    description:
      'Create a free JunubSoftFlow account to keep every licence key, invoice and installer in one place.',
    path: '/register',
  });

  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      toast.ok('Account created. Welcome to SoftFlow.');
      navigate(count > 0 ? '/checkout' : '/account', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <h2>Buy software<br />the easy way.</h2>
        <p>Create an account to keep every licence key, invoice and installer in one place.</p>
        <ul className="auth-points">
          <li><span className="check-dot"><Icon name="check" /></span> Instant licence delivery</li>
          <li><span className="check-dot"><Icon name="check" /></span> Re-download installers any time</li>
          <li><span className="check-dot"><Icon name="check" /></span> 14-day returns on unused keys</li>
        </ul>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>Create your account</h1>
          <p>It takes less than a minute.</p>

          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="r-name">Full name</label>
              <input id="r-name" value={form.name} onChange={set('name')} placeholder="Jane Doe" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="r-email">Email address</label>
              <input
                id="r-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="r-phone">
                Phone <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
              </label>
              <input id="r-phone" value={form.phone} onChange={set('phone')} placeholder="+211 920 000 000" />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="r-password">Password</label>
                <input
                  id="r-password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="r-confirm">Confirm</label>
                <input
                  id="r-confirm"
                  type="password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  placeholder="Repeat it"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="auth-foot">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
