import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useDebounce } from '../hooks/useDebounce.js';

export default function TopBar({ me }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // The URL (?q=...) is the source of truth for the search, so a search
  // can be shared as a link and survives a refresh.
  const urlQuery = searchParams.get('q') ?? '';
  const [text, setText] = useState(urlQuery);
  const debouncedText = useDebounce(text, 300);

  // When the URL changes on its own (Back button, clicking a folder), update the box.
  useEffect(() => {
    setText(urlQuery);
  }, [urlQuery]);

  // 300 ms after the user stops typing, put the search into the URL.
  // The mailbox page reads ?q= from the URL and fetches the results.
  useEffect(() => {
    const q = debouncedText.trim();
    if (q === urlQuery) return;

    if (location.pathname.startsWith('/email/')) {
      // Searching while reading an email searches the inbox.
      if (q) navigate(`/inbox?q=${encodeURIComponent(q)}`);
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (q) {
      next.set('q', q);
    } else {
      next.delete('q');
    }
    next.delete('page'); // a new search starts on page 1
    // replace: typing shouldn't add a history entry for every pause.
    setSearchParams(next, { replace: true });
    // Only the debounced text should trigger this. If urlQuery were a dependency,
    // clicking a folder would re-run it with the old text and undo the navigation.
  }, [debouncedText]);

  return (
    <header className="topbar">
      <Link to="/inbox" className="brand">
        ✉️ Mailbox
      </Link>

      <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="search-input" className="visually-hidden">
          Search mail
        </label>
        <input
          id="search-input"
          type="search"
          placeholder="Search mail"
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
        />
      </form>

      {me && (
        <span className="user" title={me.email}>
          {me.name}
        </span>
      )}
    </header>
  );
}
