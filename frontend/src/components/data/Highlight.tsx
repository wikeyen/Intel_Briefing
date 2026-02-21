// ABOUTME: Shared search highlight component — wraps text and marks matching substrings.
// ABOUTME: Used by BriefingTab and ItemCard to highlight keyword search results.

/** Renders text with matching substrings highlighted. */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  while (remaining.length > 0) {
    const idx = remaining.toLowerCase().indexOf(query)
    if (idx === -1) {
      parts.push(remaining)
      break
    }
    if (idx > 0) parts.push(remaining.slice(0, idx))
    parts.push(
      <mark key={key++} style={{ background: 'var(--accent-wash, rgba(29,107,79,0.15))', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
        {remaining.slice(idx, idx + query.length)}
      </mark>,
    )
    remaining = remaining.slice(idx + query.length)
  }
  return <>{parts}</>
}

/** Case-insensitive substring check for nullable strings. */
export function textHas(text: string | null | undefined, q: string): boolean {
  return !!text && text.toLowerCase().includes(q)
}
