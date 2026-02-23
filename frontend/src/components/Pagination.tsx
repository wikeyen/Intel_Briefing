// ABOUTME: Shared pagination bar component for paginated lists.
// ABOUTME: Shows prev/next buttons and page numbers with ellipsis for large ranges.
'use client'
import { useTranslation } from '@/lib/i18n'

/** Compute which page numbers to display, with ellipsis gaps. */
function pageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | '…')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)

  if (left > 2) pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null

  const pages = pageRange(page, totalPages)

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.25rem',
        padding: '1rem 0',
        fontSize: '0.8125rem',
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      {/* Prev */}
      <button
        aria-label={t('pagination.prev_aria')}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        style={{
          padding: '0.375rem 0.625rem',
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'none',
          color: page <= 1 ? 'var(--ink-faint)' : 'var(--ink-muted)',
          cursor: page <= 1 ? 'default' : 'pointer',
          fontSize: '0.75rem',
          opacity: page <= 1 ? 0.4 : 1,
        }}
      >
        {t('pagination.prev')}
      </button>

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === '…' ? (
          <span
            key={`ellipsis-${i}`}
            style={{ padding: '0.375rem 0.25rem', color: 'var(--ink-faint)' }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPageChange(p)}
            style={{
              minWidth: 32,
              padding: '0.375rem 0.5rem',
              border: p === page ? '1px solid var(--accent-dim)' : '1px solid var(--border)',
              borderRadius: 4,
              background: p === page ? 'var(--accent-wash)' : 'none',
              color: p === page ? 'var(--accent)' : 'var(--ink-muted)',
              fontWeight: p === page ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            {p}
          </button>
        )
      )}

      {/* Next */}
      <button
        aria-label={t('pagination.next_aria')}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        style={{
          padding: '0.375rem 0.625rem',
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'none',
          color: page >= totalPages ? 'var(--ink-faint)' : 'var(--ink-muted)',
          cursor: page >= totalPages ? 'default' : 'pointer',
          fontSize: '0.75rem',
          opacity: page >= totalPages ? 0.4 : 1,
        }}
      >
        {t('pagination.next')}
      </button>
    </nav>
  )
}
