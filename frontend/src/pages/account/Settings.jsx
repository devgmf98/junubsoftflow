import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/DashboardLayout';
import { Loading } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { date, dateTime, label, statusClass } from '../../utils/format';

export default function AccountSettings() {
  const toast = useToast();
  const { user, updateProfile } = useAuth();
  const { toggleSidebar } = useOutletContext();

  const [profile, setProfile] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        company: user.company || '',
        country: user.country || '',
        city: user.city || '',
      });
    }
  }, [user]);

  const setP = (key) => (e) => setProfile((p) => ({ ...p, [key]: e.target.value }));
  const setW = (key) => (e) => setPw((p) => ({ ...p, [key]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy('profile');
    try {
      await updateProfile(profile);
      toast.ok('Your profile has been updated.');
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy('password');
    try {
      await api.put('/auth/password', pw);
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.ok('Your password has been changed.');
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile and password" onToggleSidebar={toggleSidebar} />

      <div className="page">
        {!profile ? (
          <Loading variant="panel" />
        ) : (
          <div className="grid-2e">
            <div>
              <div className="panel">
                <div className="panel-head"><h3>Profile</h3></div>
                <div className="panel-body">
                  <form onSubmit={saveProfile}>
                    <div className="field">
                      <label htmlFor="s-name">Full name</label>
                      <input id="s-name" value={profile.name} onChange={setP('name')} required />
                    </div>
                    <div className="field">
                      <label htmlFor="s-email">Email</label>
                      <input id="s-email" value={profile.email} disabled />
                      <div className="field-hint">Contact support to change the email on your account.</div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="s-phone">Phone</label>
                        <input id="s-phone" value={profile.phone} onChange={setP('phone')} />
                      </div>
                      <div className="field">
                        <label htmlFor="s-company">Company</label>
                        <input id="s-company" value={profile.company} onChange={setP('company')} />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="s-country">Country</label>
                        <input id="s-country" value={profile.country} onChange={setP('country')} />
                      </div>
                      <div className="field">
                        <label htmlFor="s-city">City</label>
                        <input id="s-city" value={profile.city} onChange={setP('city')} />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={busy === 'profile'}>
                      {busy === 'profile' ? 'Saving...' : 'Save profile'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            <div>
              <div className="panel">
                <div className="panel-head"><h3>Password</h3></div>
                <div className="panel-body">
                  <form onSubmit={savePassword}>
                    <div className="field">
                      <label htmlFor="p-cur">Current password</label>
                      <input
                        id="p-cur"
                        type="password"
                        value={pw.currentPassword}
                        onChange={setW('currentPassword')}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="p-new">New password</label>
                        <input
                          id="p-new"
                          type="password"
                          value={pw.newPassword}
                          onChange={setW('newPassword')}
                          autoComplete="new-password"
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="p-con">Confirm</label>
                        <input
                          id="p-con"
                          type="password"
                          value={pw.confirmPassword}
                          onChange={setW('confirmPassword')}
                          autoComplete="new-password"
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={busy === 'password'}>
                      {busy === 'password' ? 'Saving...' : 'Change password'}
                    </button>
                  </form>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Account</h3></div>
                <div className="panel-body">
                  <div className="stat-line">
                    <span>Member since</span>
                    <b>{date(user?.createdAt)}</b>
                  </div>
                  <div className="stat-line">
                    <span>Status</span>
                    <span className={`badge ${statusClass(user?.status)}`}>{label(user?.status)}</span>
                  </div>
                  <div className="stat-line">
                    <span>Account type</span>
                    <b>{label(user?.role)}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
