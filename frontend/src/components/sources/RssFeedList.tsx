// ABOUTME: RSS feed list with per-feed category switching.
// ABOUTME: Add input at top, feed rows below with type toggle (news/blog/other) and remove.
'use client'
import { useState, useRef } from 'react'
import type { RssFeedEntry, RssFeedType } from '@/lib/models'

const TYPE_LABELS: Record<RssFeedType, { label: string; color: string; bg: string }> = {
  news:  { label: 'news',  color: '#1a4b8c', bg: '#e8f0fe' },
  blog:  { label: 'blog',  color: '#6d28d9', bg: '#ede9fe' },
  other: { label: 'other', color: 'var(--ink-muted)', bg: 'var(--surface-alt)' },
}

const TYPE_CYCLE: RssFeedType[] = ['news', 'blog', 'other']

interface RssFeedListProps {
  feeds: RssFeedEntry[]
  onChange: (feeds: RssFeedEntry[]) => void
  onAdd: (url: string) => void
}

export function RssFeedList({ feeds, onChange, onAdd }: RssFeedListProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    const url = input.trim()
    if (!url) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setError('Must be an HTTP(S) URL')
        return
      }
    } catch {
      setError('Invalid URL')
      return
    }
    if (feeds.some(f => f.url === url)) {
      setError('Already added')
      return
    }
    setError(null)
    setInput('')
    onAdd(url)
  }

  const cycleType = (index: number) => {
    const feed = feeds[index]
    const currentIdx = TYPE_CYCLE.indexOf(feed.type)
    const nextType = TYPE_CYCLE[(currentIdx + 1) % TYPE_CYCLE.length]
    const next = [...feeds]
    next[index] = { ...feed, type: nextType }
    onChange(next)
  }

  const remove = (index: number) => {
    onChange(feeds.filter((_, i) => i !== index))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {/* Add input */}
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder="https://example.com/feed.xml — press Enter"
          style={{
            flex: 1,
            padding: '0.375rem 0.5rem',
            fontSize: '0.75rem',
            border: `1px solid ${error ? 'var(--err)' : 'var(--border)'}`,
            borderRadius: 4,
            background: 'var(--surface)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
      </div>
      {error && (
        <div style={{ fontSize: '0.625rem', color: 'var(--err)' }}>{error}</div>
      )}

      {/* Feed list */}
      {feeds.map((feed, i) => {
        const meta = TYPE_LABELS[feed.type]
        return (
          <div key={feed.url} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.25rem 0',
          }}>
            <button
              type="button"
              onClick={() => cycleType(i)}
              title={`Click to change category (currently: ${feed.type})`}
              style={{
                fontSize: '0.5625rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: meta.bg,
                color: meta.color,
                border: 'none',
                padding: '0.125rem 0.375rem',
                borderRadius: 999,
                cursor: 'pointer',
                flexShrink: 0,
                minWidth: 40,
                textAlign: 'center',
              }}
            >
              {meta.label}
            </button>
            <span style={{
              flex: 1,
              fontSize: '0.6875rem',
              color: 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {feed.url}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-faint)',
                fontSize: '0.875rem',
                padding: '0 0.25rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
