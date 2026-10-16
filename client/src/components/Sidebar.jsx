import { NavLink } from 'react-router';

// Count badge, hidden when there's nothing unread.
function Count({ value }) {
  if (!value) return null;
  return <span className="nav-count">{value.toLocaleString()}</span>;
}

export default function Sidebar({ inboxUnread, labels, onCompose }) {
  return (
    <nav className="sidebar" aria-label="Mailbox folders">
      <button type="button" className="button button-primary compose-button" onClick={onCompose}>
        ✏️ Compose
      </button>

      <ul className="nav-list">
        <li>
          {/* NavLink adds the "active" class when its route is the current page. */}
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
    </nav>
  );
}
