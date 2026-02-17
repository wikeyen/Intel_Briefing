// ABOUTME: Schedule configuration page — daily fetch time, timezone, and cache TTL.
// ABOUTME: Saves to PUT /config; shows success/error toast via callback.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Seoul',
  'Australia/Sydney',
]

const inputStyle = {
  background: 'var(--canvas)',
  border: '1px solid var(--border)',
  borderRadius: 2,
  padding: '0.625rem 0.75rem',
  fontSize: '0.9375rem',
  color: 'var(--ink)',
  outline: 'none',
  transition: 'border-color 150ms',
  fontFamily: 'inherit',
}

export function Schedule({ showToast }: Props) {
  const [fetchTime, setFetchTime] = useState('07:00')
  const [timezone, setTimezone] = useState('UTC')
  const [cacheTtl, setCacheTtl] = useState(25)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setFetchTime(cfg.fetch_time)
      setTimezone(cfg.fetch_timezone)
      setCacheTtl(cfg.cache_ttl_hours)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        fetch_time: fetchTime,
        fetch_timezone: timezone,
        cache_ttl_hours: cacheTtl,
      })
      showToast('Schedule saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="schedule" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionHeader title="Schedule" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Daily Fetch Time
        </label>
        <input
          type="time"
          value={fetchTime}
          onChange={(e) => setFetchTime(e.target.value)}
          style={{ ...inputStyle, width: 160 }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Timezone
        </label>
        <div style={{ position: 'relative' }}>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            style={{
              ...inputStyle,
              width: '100%',
              appearance: 'none',
              WebkitAppearance: 'none',
              paddingRight: '2rem',
              cursor: 'pointer',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          {/* Custom chevron */}
          <span style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--ink-faint)',
            fontSize: '0.625rem',
          }}>▾</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Cache TTL —{' '}
          <span style={{ color: 'var(--ink)' }}>{cacheTtl}h</span>
        </label>
        <input
          type="range"
          min={1}
          max={72}
          value={cacheTtl}
          onChange={(e) => setCacheTtl(Number(e.target.value))}
        />
        <p style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>
          Cached data older than this is flagged stale. Set longer than your fetch interval to avoid gaps.
        </p>
      </div>

      <div>
        <button
          onClick={save}
          disabled={saving}
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: saving ? 'var(--ink-faint)' : 'var(--accent)',
            border: '1.5px solid',
            borderColor: saving ? 'var(--border)' : 'var(--accent)',
            borderRadius: 2,
            padding: '0.4rem 1.25rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
            background: 'transparent',
          }}
          onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--accent-wash)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}
