// Shows "21–40 of 2,075" with previous/next buttons.
export default function Pagination({ page, limit, total, onPageChange }) {
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const isFirstPage = page <= 1;
  const isLastPage = last >= total;

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-range">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </span>
      <button
        type="button"
        className="icon-button"
        onClick={() => onPageChange(page - 1)}
        disabled={isFirstPage}
        aria-label="Previous page"
      >
        ‹
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={() => onPageChange(page + 1)}
        disabled={isLastPage}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}
