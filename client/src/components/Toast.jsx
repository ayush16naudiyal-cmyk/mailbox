import { useEffect } from 'react';

// A small message at the bottom of the screen that hides itself after 4 seconds.
export default function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss message">
        ×
      </button>
    </div>
  );
}
