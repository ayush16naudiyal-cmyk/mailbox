import { Link } from 'react-router';

export default function TopBar({ me }) {
  return (
    <header className="topbar">
      <Link to="/inbox" className="brand">
        ✉️ Mailbox
      </Link>
      {me && (
        <span className="user" title={me.email}>
          {me.name}
        </span>
      )}
    </header>
  );
}
