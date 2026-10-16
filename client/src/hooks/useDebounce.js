import { useEffect, useState } from 'react';

// Returns `value`, but only after it has stopped changing for `delay` ms.
// Typing "exam" quickly gives one update ("exam"), not four ("e", "ex", ...),
// so we send one search request instead of one per keystroke.
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    // A new keystroke cancels the previous timer before it fires.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
