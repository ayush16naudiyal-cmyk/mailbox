// The three states every data view can be in besides "has data".

export function LoadingState() {
  // role="status" makes screen readers announce it without moving focus.
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      Loading…
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">Something went wrong</p>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, message }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      <p>{message}</p>
    </div>
  );
}
