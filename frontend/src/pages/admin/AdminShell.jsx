import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../api/client';

/** Loads the sidebar badge counts once for the whole admin console. */
export default function AdminShell() {
  const [badges, setBadges] = useState({});

  useEffect(() => {
    api
      .get('/admin/dashboard')
      .then((d) => setBadges(d.badges || {}))
      .catch(() => setBadges({}));
  }, []);

  return <DashboardLayout variant="admin" badges={badges} />;
}
