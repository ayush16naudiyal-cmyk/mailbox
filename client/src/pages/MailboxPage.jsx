import { useEffect, useState } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useEmails } from '../hooks/useEmails.js';
import EmailList from '../components/EmailList.jsx';
import Pagination from '../components/Pagination.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';

// What each sidebar view asks the API for.
const VIEWS = {
  inbox: { title: 'Inbox', filters: { folder: 'inbox' }, empty: 'Your inbox is empty.' },
  starred: { title: 'Starred', filters: { starred: 'true' }, empty: 'Star an email to see it here.' },
  sent: { title: 'Sent', filters: { folder: 'sent' }, empty: "You haven't sent anything yet." },
  trash: { title: 'Trash', filters: { folder: 'trash' }, empty: 'Trash is empty.' },
  label: { title: 'Label', filters: {}, empty: 'No emails have this label.' },
};

export default function MailboxPage({ view }) {
  const { labelId } = useParams();
  const { labels, refreshCounts, showToast, mailVersion } = useOutletContext();

  // Page and search live in the URL (?page=2&q=exam), so refresh,
  // the back button and shared links all keep them.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page')) || 1;
  const q = searchParams.get('q') ?? '';

  const config = VIEWS[view];
  const filters = view === 'label' ? { label: labelId } : config.filters;
  const title =
    view === 'label' ? labels.find((l) => String(l.id) === labelId)?.name ?? 'Label' : config.title;

  const { emails, setEmails, total, limit, loading, error, reload } = useEmails(
    { ...filters, q, page },
    mailVersion
  );

  // e.g. "Inbox – Mailbox" or "exam – Inbox – Mailbox" in the browser tab.
  useEffect(() => {
    document.title = q ? `${q} – ${title} – Mailbox` : `${title} – Mailbox`;
  }, [q, title]);

  // Ids of the ticked rows. Cleared when you move to another page, search or label.
  const [selectedIds, setSelectedIds] = useState([]);
  useEffect(() => {
    setSelectedIds([]);
  }, [page, q, labelId]);

  function goToPage(newPage) {
    const next = new URLSearchParams(searchParams);
    next.set('page', newPage);
    setSearchParams(next);
    window.scrollTo(0, 0);
  }

  function toggleSelect(id) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const allSelected = emails.length > 0 && selectedIds.length === emails.length;
  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : emails.map((e) => e.id));
  }

  // Optimistic update: change the rows on screen straight away, then tell the
  // server. If the server says no, put the old rows back and show an error.
  async function updateEmails(ids, changes) {
    const oldRows = emails.filter((e) => ids.includes(e.id));
    setEmails((list) => list.map((e) => (ids.includes(e.id) ? { ...e, ...changes } : e)));

    try {
      // There's no bulk endpoint, so a bulk action sends one PATCH per email, in parallel.
      await Promise.all(ids.map((id) => api(`/emails/${id}`, { method: 'PATCH', body: changes })));
      if ('is_read' in changes) refreshCounts();
    } catch (err) {
      setEmails((list) => list.map((e) => oldRows.find((old) => old.id === e.id) ?? e));
      showToast(`Couldn't update: ${err.message}`, 'error');
    }
  }

  // Not optimistic: rows only disappear once the server has moved them,
  // then we reload so the page fills back up to 20 rows.
  async function moveSelectedToTrash() {
    const count = selectedIds.length;
    try {
      await Promise.all(
        selectedIds.map((id) => api(`/emails/${id}`, { method: 'PATCH', body: { folder: 'trash' } }))
      );
      showToast(`Moved ${count} ${count === 1 ? 'email' : 'emails'} to trash`);
    } catch (err) {
      showToast(`Couldn't move to trash: ${err.message}`, 'error');
    }
    setSelectedIds([]);
    reload();
    refreshCounts();
  }

  let content;
  if (loading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState message={error} onRetry={reload} />;
  } else if (emails.length === 0) {
    content = q ? (
      <EmptyState title="No results" message={`No emails in ${title} match “${q}”.`} />
    ) : (
      <EmptyState title="Nothing here" message={config.empty} />
    );
  } else {
    content = (
      <>
        <EmailList
          emails={emails}
          showRecipient={view === 'sent'}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleStar={(email) => updateEmails([email.id], { is_starred: !email.is_starred })}
        />
        <Pagination page={page} limit={limit} total={total} onPageChange={goToPage} />
      </>
    );
  }

  return (
    <section className="mailbox" aria-label={title}>
      <div className="mailbox-header">
        <input
          type="checkbox"
          className="row-checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          disabled={emails.length === 0 || loading}
          aria-label="Select all emails on this page"
        />

        {selectedIds.length > 0 ? (
          <div className="bulk-actions" role="toolbar" aria-label="Actions for selected emails">
            <span className="bulk-count">{selectedIds.length} selected</span>
            <button type="button" className="button" onClick={() => updateEmails(selectedIds, { is_read: true })}>
              Mark read
            </button>
            <button type="button" className="button" onClick={() => updateEmails(selectedIds, { is_read: false })}>
              Mark unread
            </button>
            {view !== 'trash' && (
              <button type="button" className="button" onClick={moveSelectedToTrash}>
                Move to trash
              </button>
            )}
          </div>
        ) : (
          <h1>
            {title}
            {q && <span className="search-note"> · results for “{q}”</span>}
          </h1>
        )}
      </div>
      {content}
    </section>
  );
}
