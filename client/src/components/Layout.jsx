import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { api } from '../api.js';
import ComposeModal from './ComposeModal.jsx';
import Sidebar from './Sidebar.jsx';
import Toast from './Toast.jsx';
import TopBar from './TopBar.jsx';

// The frame around every page: top bar, sidebar, and the current page in <Outlet />.
// It also owns the things every page shares: sidebar counts, toasts, compose
// and (on small screens) whether the sidebar drawer is open.
export default function Layout() {
  const [me, setMe] = useState(null);
  const [labels, setLabels] = useState(null); // null = still loading
  const [labelsError, setLabelsError] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Bumped after sending an email so the open list (e.g. Sent) re-fetches.
  const [mailVersion, setMailVersion] = useState(0);
  const location = useLocation();

  // Loads the sidebar numbers (inbox unread count and label counts).
  // Pages call this after changing an email so the badges stay correct.
  const refreshCounts = useCallback(() => {
    api('/me').then(setMe).catch(() => {}); // the badge is optional; just leave it out
    api('/labels')
      .then((data) => {
        setLabels(data);
        setLabelsError(false);
      })
      .catch(() => setLabelsError(true));
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // Close the drawer after navigating (e.g. tapping a folder in it).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  // While the drawer is open: move focus into it, and let Esc close it.
  useEffect(() => {
    if (!drawerOpen) return;

    document.querySelector('#sidebar .compose-button')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        document.getElementById('menu-button')?.focus(); // give focus back to where it came from
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  // The id makes a repeated identical message count as a new toast (and restart its timer).
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  function openCompose() {
    setDrawerOpen(false);
    setComposeOpen(true);
  }

  function handleSent() {
    setComposeOpen(false);
    showToast('Message sent');
    refreshCounts();
    setMailVersion((v) => v + 1);
  }

  return (
    <div className={drawerOpen ? 'app drawer-open' : 'app'}>
      <TopBar me={me} menuOpen={drawerOpen} onMenuClick={() => setDrawerOpen((open) => !open)} />
      <Sidebar
        inboxUnread={me?.inbox_unread}
        labels={labels}
        labelsError={labelsError}
        onRetryLabels={refreshCounts}
        onCompose={openCompose}
      />
      {/* Dark backdrop behind the mobile drawer; tapping it closes the drawer. */}
      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}

      <main className="main">
        {/* Child pages read these with useOutletContext(). */}
        <Outlet context={{ labels: labels ?? [], refreshCounts, showToast, mailVersion }} />
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
