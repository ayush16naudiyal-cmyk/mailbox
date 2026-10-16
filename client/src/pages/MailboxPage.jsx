import { useOutletContext, useParams, useSearchParams } from 'react-router';
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
  const { labels } = useOutletContext();

  // The page number lives in the URL (?page=2), so refresh and the back button keep it.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page')) || 1;

  const config = VIEWS[view];
  const filters = view === 'label' ? { label: labelId } : config.filters;
  const title =
    view === 'label' ? labels.find((l) => String(l.id) === labelId)?.name ?? 'Label' : config.title;

  const { emails, total, limit, loading, error, reload } = useEmails({ ...filters, page });

  function goToPage(newPage) {
    const next = new URLSearchParams(searchParams);
    next.set('page', newPage);
    setSearchParams(next);
    window.scrollTo(0, 0);
  }

  let content;
  if (loading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState message={error} onRetry={reload} />;
  } else if (emails.length === 0) {
    content = <EmptyState title="Nothing here" message={config.empty} />;
  } else {
    content = (
      <>
        <EmailList emails={emails} showRecipient={view === 'sent'} />
        <Pagination page={page} limit={limit} total={total} onPageChange={goToPage} />
      </>
    );
  }

  return (
    <section className="mailbox" aria-labelledby="mailbox-title">
      <div className="mailbox-header">
        <h1 id="mailbox-title">{title}</h1>
      </div>
      {content}
    </section>
  );
}
