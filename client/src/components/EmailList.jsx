import { Link } from 'react-router';
import { formatEmailDate } from '../utils/formatDate.js';

export default function EmailList({ emails, showRecipient }) {
  return (
    <ul className="email-list">
      {emails.map((email) => (
        <li key={email.id} className={email.is_read ? 'email-row' : 'email-row unread'}>
          <Link to={`/email/${email.id}`} className="email-link">
            <span className="email-sender">
              {showRecipient ? `To: ${email.recipient_email}` : email.sender_name}
            </span>
            <span className="email-text">
              <span className="email-subject">{email.subject}</span>
              <span className="email-snippet"> — {email.snippet}</span>
            </span>
            <time className="email-date" dateTime={email.created_at}>
              {formatEmailDate(email.created_at)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
