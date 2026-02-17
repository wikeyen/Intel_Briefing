// ABOUTME: Sensor toggle page — enable/disable each data source individually.
// ABOUTME: Shows OK/FAILED/DISABLED badge per sensor based on latest fetch results.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const ALL_SENSORS = [
  { key: 'hacker_news', label: 'Hacker News' },
  { key: 'arxiv', label: 'ArXiv AI' },
  { key: 'github', label: 'GitHub Trending' },
  { key: 'product_hunt', label: 'Product Hunt' },
  { key: 'v2ex', label: 'V2EX' },
  { key: 'hn_blogs', label: 'HN Blogs' },
  { key: 'grok', label: 'Grok Tech Trends' },
  { key: 'sources_36kr', label: '36Kr' },
  { key: 'wallstreetcn', label: 'WallStreetCN' },
  { key: 'politics', label: 'Politics (X Accounts)' },
  { key: 'topics', label: 'Topics (X Keywords)' },
]

type StatusMap = Record<string, 'ok' | 'failed' | 'disabled'>

function StatusBadge({ status }: { status: 'ok' | 'failed' | 'disabled' | undefined }) {
  if (!status) return null
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    ok: { bg: 'var(--ok-bg)', color: 'var(--ok)', label: 'OK' },
    failed: { bg: 'var(--err-bg)', color: 'var(--err)', label: 'Failed' },
    disabled: { bg: 'var(--surface-alt)', color: 'var(--ink-faint)', label: 'Disabled' },
  }
  const s = styles[status]
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      padding: '0.15rem 0.5rem',
      borderRadius: 2,
    }}>
      {s.label}
    </span>
  )
}

export function Sensors({ showToast }: Props) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<StatusMap>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const { key } of ALL_SENSORS) defaults[key] = true
      setEnabled({ ...defaults, ...cfg.sensors_enabled })
    })
    api.getLatest().then((report) => {
      const map: StatusMap = {}
      for (const key of report.sources_ok) map[key] = 'ok'
      for (const key of report.sources_failed) map[key] = 'failed'
      setStatuses(map)
    }).catch(() => {})
  }, [])

  const toggle = (key: string) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ sensors_enabled: enabled })
      showToast('Sensor settings saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const getBadgeStatus = (key: string): 'ok' | 'failed' | 'disabled' | undefined => {
    if (!enabled[key]) return 'disabled'
    return statuses[key]
  }

  return (
    <section id="sensors" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionHeader title="Sensors" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {ALL_SENSORS.map(({ key, label }, i) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 0',
              borderBottom: i < ALL_SENSORS.length - 1 ? '1px solid var(--border-soft)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled[key] ?? true}
                onClick={() => toggle(key)}
                style={{
                  position: 'relative',
                  width: 32,
                  height: 18,
                  borderRadius: 9,
                  border: enabled[key] ? 'none' : '1.5px solid var(--border)',
                  background: enabled[key] ? 'var(--accent)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 150ms, border-color 150ms',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: enabled[key] ? 2 : 1.5,
                  left: enabled[key] ? 16 : 1.5,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: enabled[key] ? 'var(--canvas)' : 'var(--ink-faint)',
                  transition: 'left 150ms, background 150ms',
                }} />
              </button>
              <span style={{ fontSize: '0.9375rem', color: enabled[key] ? 'var(--ink)' : 'var(--ink-muted)' }}>
                {label}
              </span>
            </div>
            <StatusBadge status={getBadgeStatus(key)} />
          </div>
        ))}
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
