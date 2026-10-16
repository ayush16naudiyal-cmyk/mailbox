import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { api } from '../api.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

// The frame around every page: top bar, sidebar, and the current page in <Outlet />.
export default function Layout() {
  const [me, setMe] = useState(null);
  const [labels, setLabels] = useState([]);

  // Loads the sidebar numbers (inbox unread count and label counts).
  // Pages call this after changing an email so the badges stay correct.
  // If it fails the sidebar just shows no counts; the page itself shows the error.
  const refreshCounts = useCallback(() => {
    api('/me').then(setMe).catch(() => {});
    api('/labels').then(setLabels).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  return (
    <div className="app">
      <TopBar me={me} />
      <Sidebar inboxUnread={me?.inbox_unread} labels={labels} />
      <main className="main">
        {/* Child pages read these with useOutletContext(). */}
        <Outlet context={{ labels, refreshCounts }} />
      </main>
    </div>
  );
}
