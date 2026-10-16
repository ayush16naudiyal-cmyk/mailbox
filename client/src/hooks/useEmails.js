import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Loads one page of emails for the given filters, e.g.
//   useEmails({ folder: 'inbox', page: 2, q: 'exam' })
// and re-fetches whenever the filters change, or when refreshKey changes
// (the layout bumps it after an email is sent).
export function useEmails(filters, refreshKey = 0) {
  // Turn the filters into a query string, skipping empty ones. Using the string
  // as the effect dependency means a new-but-equal filters object won't refetch.
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();

  const [emails, setEmails] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    // If the filters change before this request finishes, ignore its answer.
    // Otherwise a slow old response could overwrite a newer one.
    let ignore = false;

    setLoading(true);
    setError(null);

    api(`/emails?${query}`)
      .then((result) => {
        if (ignore) return;
        setEmails(result.data);
        setMeta({
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        });
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [query, reloadCount, refreshKey]);

  return {
    emails,
    setEmails, // exposed so the page can update rows instantly (optimistic updates)
    ...meta,
    loading,
    error,
    reload: () => setReloadCount((count) => count + 1),
  };
}
