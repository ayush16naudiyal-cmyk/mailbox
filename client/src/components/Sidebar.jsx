import { NavLink } from 'react-router';

// Count badge, hidden when there's nothing unread.
function Count({ value }) {
  if (!value) return null;
  return <span className="nav-count">{value.toLocaleString()}</span>;
}

// labels is null while loading, and labelsError is true if loading failed.
function LabelList({ labels, labelsError, onRetryLabels }) {
  if (labelsError) {
    return (
      <p className="nav-message">
        Couldn't load labels.{' '}
        <button type="button" className="link-button" onClick={onRetryLabels}>
          Retry
        </button>
      </p>
    );
  }
  if (labels === null) {
    return <p className="nav-message">Loading…</p>;
  }
  if (labels.length === 0) {
    return <p className="nav-message">No labels yet.</p>;
  }

  return (
    <ul className="nav-list">
      {labels.map((label) => (
        <li key={label.id}>
          <NavLink to={`/label/${label.id}`} className="nav-link">
            <span>{label.name}</span>
            <Count value={label.unread_count} />
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

// On desktop this is a normal column. Under 768px the CSS turns it into a
// slide-in drawer, shown when the layout adds the "drawer-open" class.
export default function Sidebar({ inboxUnread, labels, labelsError, onRetryLabels, onCompose }) {
  return (
    <nav id="sidebar" className="sidebar" aria-label="Mailbox folders">
      <button type="button" className="button button-primary compose-button" onClick={onCompose}>
        ✏️ Compose
      </button>

      <ul className="nav-list">
        <li>
          {/* NavLink adds the "active" class and aria-current="page" on the current page. */}
          <NavLink to="/inbox" className="nav-link">
            <span>Inbox</span>
            <Count value={inboxUnread} />
          </NavLink>
        </li>
        <li>
          <NavLink to="/starred" className="nav-link">Starred</NavLink>
        </li>
        <li>
          <NavLink to="/sent" className="nav-link">Sent</NavLink>
        </li>
        <li>
          <NavLink to="/trash" className="nav-link">Trash</NavLink>
        </li>
      </ul>

      <h2 className="nav-heading">Labels</h2>
      <LabelList labels={labels} labelsError={labelsError} onRetryLabels={onRetryLabels} />
    </nav>
  );
}
