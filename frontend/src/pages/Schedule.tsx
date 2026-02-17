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

const inputBase: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.75rem 1rem',
  fontSize: '0.9375rem',
  color: 'var(--ink)',
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'inherit',
}

function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
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
      await api.updateConfig({ fetch_time: fetchTime, fetch_timezone: timezone, cache_ttl_hours: cacheTtl })
      showToast('Schedule saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="schedule" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <SectionHeader
        num="03"
        title="Schedule"
        description="Control when the pipeline runs and how long fetched data is cached before being considered stale."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Fetch time + Timezone side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
              Daily Fetch Time
            </label>
            <input
              type="time"
              value={fetchTime}
              onChange={(e) => setFetchTime(e.target.value)}
              style={{ ...inputBase, width: '100%' }}
              onFocus={focus}
              onBlur={blur}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
              Timezone
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{
                  ...inputBase,
                  width: '100%',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  paddingRight: '2.25rem',
                  cursor: 'pointer',
                }}
                onFocus={focus}
                onBlur={blur}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <span style={{
                position: 'absolute',
                right: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--ink-faint)',
                fontSize: '0.625rem',
                userSelect: 'none',
              }}>
                ▾
              </span>
            </div>
          </div>
        </div>

        {/* Cache TTL */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
              Cache TTL
            </label>
            <span style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {cacheTtl}h
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={72}
            value={cacheTtl}
            onChange={(e) => setCacheTtl(Number(e.target.value))}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
            Data older than this threshold is flagged as stale. Set higher than your fetch interval to avoid gaps.
          </p>
        </div>

        <div>
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '0.625rem 1.5rem',
              borderRadius: 4,
              border: 'none',
              color: saving ? 'var(--ink-faint)' : '#FFFFFF',
              background: saving ? 'var(--border)' : 'var(--ink)',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = '#000000' }}
            onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--ink)' }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </section>
  )
}
