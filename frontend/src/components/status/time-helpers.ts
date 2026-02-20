// ABOUTME: Time formatting utilities for the Status dashboard.
// ABOUTME: Provides timeAgo() for relative timestamps and nextFetchIn() for countdown to next scheduled run.

export function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function nextFetchIn(fetchTime: string, timezone: string): string {
  try {
    const [h, m] = fetchTime.split(':').map(Number)
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now)
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
    const tzMin  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
    let diff = (h * 60 + m) - (tzHour * 60 + tzMin)
    if (diff <= 0) diff += 24 * 60
    const dh = Math.floor(diff / 60)
    const dm = diff % 60
    return dh > 0 ? `in ${dh}h ${dm}m` : `in ${dm}m`
  } catch {
    return ''
  }
}
