import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { api } from '../api.js';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { formatFullDate } from '../utils/formatDate.js';

export default function EmailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshCounts, showToast } = useOutletContext();

  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [busy, setBusy] = useState(false); // true while trash/delete/unread is in progress

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    api(`/emails/${id}`)
      .then((data) => {
        if (ignore) return;
        setEmail({ ...data, is_read: true });

        // Opening an email marks it as read.
        if (!data.is_read) {
          api(`/emails/${id}`, { method: 'PATCH', body: { is_read: true } })
            .then(refreshCounts)
            .catch(() => {}); // not worth an error message; it stays unread on the server
        }
      })
      .catch((err) => {
        if (!ignore) setError(err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id, reloadCount, refreshCounts]);

  // The browser tab shows the subject, which also helps screen reader users know where they are.
  useEffect(() => {
    if (email) document.title = `${email.subject} – Mailbox`;
  }, [email]);

  function goBack() {
    // location.key is "default" when this is the first page loaded (e.g. opened
    // from a shared link). Then there's nothing to go back to, so open the folder.
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(`/${email?.folder ?? 'inbox'}`);
    }
  }

  // Optimistic: the star changes immediately and flips back if the request fails.
  async function toggleStar() {
    const starred = !email.is_starred;
    setEmail((current) => ({ ...current, is_starred: starred }));
    try {
      await api(`/emails/${email.id}`, { method: 'PATCH', body: { is_starred: starred } });
    } catch (err) {
      setEmail((current) => ({ ...current, is_starred: !starred }));
      showToast(`Couldn't update the star: ${err.message}`, 'error');
    }
  }

  // Runs an action that leaves this page when it succeeds.
  async function runAndGoBack(request, successMessage) {
    setBusy(true);
    try {
      await request();
      refreshCounts();
      showToast(successMessage);
      goBack();
    } catch (err) {
      showToast(err.message, 'error');
      setBusy(false);
    }
  }

  function markUnread() {
    runAndGoBack(
      () => api(`/emails/${email.id}`, { method: 'PATCH', body: { is_read: false } }),
      'Marked as unread'
    );
  }

  function moveToTrash() {
    runAndGoBack(
      () => api(`/emails/${email.id}`, { method: 'PATCH', body: { folder: 'trash' } }),
      'Moved to trash'
    );
  }

  function deleteForever() {
    // Permanent and can't be undone, so ask first.
    if (!window.confirm("Delete this email forever? This can't be undone.")) return;
    runAndGoBack(() => api(`/emails/${email.id}`, { method: 'DELETE' }), 'Email deleted forever');
  }

  if (loading) {
    return (
      <section className="email-view">
        <LoadingState />
      </section>
    );
  }

  if (error) {
    return (
      <section className="email-view">
        {/* Retrying can't fix a 404, so it gets a plain message instead of "Try again". */}
        {error.status === 404 ? (
          <EmptyState title="Email not found" message="It may have been deleted, or the link is wrong." />
        ) : (
          <ErrorState message={error.message} onRetry={() => setReloadCount((c) => c + 1)} />
        )}
        <div className="email-view-back">
          <button type="button" className="button" onClick={goBack}>
            ← Back
          </button>
        </div>
      </section>
    );
  }

  const inTrash = email.folder === 'trash';

  return (
    <article className="email-view" aria-labelledby="email-subject">
      <div className="email-toolbar" role="toolbar" aria-label="Email actions">
        <button type="button" className="button" onClick={goBack}>
          ← Back
        </button>
        <button
          type="button"
          className={`star-button${email.is_starred ? ' starred' : ''}`}
          onClick={toggleStar}
          aria-pressed={email.is_starred}
          aria-label="Starred"
        >
          {email.is_starred ? '★' : '☆'}
        </button>
        <button type="button" className="button" onClick={markUnread} disabled={busy}>
          Mark unread
        </button>
        {inTrash ? (
          <button type="button" className="button button-danger" onClick={deleteForever} disabled={busy}>
            Delete forever
          </button>
        ) : (
          <button type="button" className="button" onClick={moveToTrash} disabled={busy}>
            Move to trash
          </button>
        )}
      </div>

      <h1 id="email-subject" className="email-view-subject">
        {email.subject}
      </h1>

      {email.labels.length > 0 && (
        <ul className="label-chips" aria-label="Labels">
          {email.labels.map((label) => (
            <li key={label.id} className="label-chip">
              {label.name}
            </li>
          ))}
        </ul>
      )}

      <div className="email-meta">
        <div>
          <span className="email-meta-name">{email.sender_name}</span>{' '}
          <span className="email-meta-address">&lt;{email.sender_email}&gt;</span>
          <div className="email-meta-address">to {email.recipient_email}</div>
        </div>
        <time dateTime={email.created_at} className="email-meta-date">
          {formatFullDate(email.created_at)}
        </time>
      </div>

      {/* Plain text body: React escapes it, so any HTML in an email is shown as text, not run. */}
      <div className="email-body">{email.body}</div>
    </article>
  );
}
