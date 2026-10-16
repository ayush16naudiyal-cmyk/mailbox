// Today -> "9:41 AM", earlier this year -> "Oct 12", older -> "12 Oct 2024".
export function formatEmailDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// Full date and time for the email view, e.g. "Mon, 12 Oct 2026, 9:41 AM".
export function formatFullDate(isoString) {
  return new Date(isoString).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
