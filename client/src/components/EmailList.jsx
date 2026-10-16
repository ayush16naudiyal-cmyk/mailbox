import { Link } from 'react-router';
import { formatEmailDate } from '../utils/formatDate.js';

export default function EmailList({ emails, showRecipient, selectedIds, onToggleSelect, onToggleStar }) {
  return (
    <ul className="email-list">
      {emails.map((email) => {
        const who = showRecipient ? `To: ${email.recipient_email}` : email.sender_name;
        const isSelected = selectedIds.includes(email.id);

        return (
          <li
            key={email.id}
            className={`email-row${email.is_read ? '' : ' unread'}${isSelected ? ' selected' : ''}`}
          >
            {/* The checkbox and star sit outside the link: a button inside a link is invalid HTML. */}
            <input
              type="checkbox"
              className="row-checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(email.id)}
              aria-label={`Select email from ${who}: ${email.subject}`}
            />
            <button
              type="button"
              className={`star-button${email.is_starred ? ' starred' : ''}`}
              onClick={() => onToggleStar(email)}
              aria-pressed={email.is_starred}
              aria-label="Starred"
            >
              {email.is_starred ? '★' : '☆'}
            </button>

            <Link to={`/email/${email.id}`} className="email-link">
              <span className="email-sender">{who}</span>
              <span className="email-text">
                <span className="email-subject">{email.subject}</span>
                <span className="email-snippet"> — {email.snippet}</span>
              </span>
              <time className="email-date" dateTime={email.created_at}>
                {formatEmailDate(email.created_at)}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
