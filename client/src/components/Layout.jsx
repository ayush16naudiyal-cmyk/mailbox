import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { api } from '../api.js';
import ComposeModal from './ComposeModal.jsx';
import Sidebar from './Sidebar.jsx';
import Toast from './Toast.jsx';
import TopBar from './TopBar.jsx';

// The frame around every page: top bar, sidebar, and the current page in <Outlet />.
// It also owns the things every page shares: sidebar counts, toasts and compose.
export default function Layout() {
  const [me, setMe] = useState(null);
  const [labels, setLabels] = useState([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Bumped after sending an email so the open list (e.g. Sent) re-fetches.
  const [mailVersion, setMailVersion] = useState(0);

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

  // The id makes a repeated identical message count as a new toast (and restart its timer).
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  function handleSent() {
    setComposeOpen(false);
    showToast('Message sent');
    refreshCounts();
    setMailVersion((v) => v + 1);
  }

  return (
    <div className="app">
      <TopBar me={me} />
      <Sidebar inboxUnread={me?.inbox_unread} labels={labels} onCompose={() => setComposeOpen(true)} />
      <main className="main">
        {/* Child pages read these with useOutletContext(). */}
        <Outlet context={{ labels, refreshCounts, showToast, mailVersion }} />
      </main>

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} onSent={handleSent} />}

      {/* aria-live: screen readers read out whatever appears inside this region. It must
          already be on the page before the toast appears, so it is always rendered. */}
      <div className="toast-region" aria-live="polite">
        {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onDismiss={hideToast} />}
      </div>
    </div>
  );
}
