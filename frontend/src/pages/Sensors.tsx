// ABOUTME: Sensor toggle page — enable/disable each data source individually.
// ABOUTME: Shows OK/FAILED/DISABLED badge per sensor based on latest fetch results.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const ALL_SENSORS = [
  { key: 'hacker_news',   label: 'Hacker News',          desc: 'Top stories from news.ycombinator.com' },
  { key: 'arxiv',         label: 'ArXiv AI',             desc: 'Latest AI/ML research preprints' },
  { key: 'github',        label: 'GitHub Trending',      desc: 'Daily trending repositories' },
  { key: 'product_hunt',  label: 'Product Hunt',         desc: 'Top products of the day' },
  { key: 'v2ex',          label: 'V2EX',                 desc: 'Chinese tech community hot posts' },
  { key: 'hn_blogs',      label: 'HN Blogs',             desc: 'Curated blog posts from Hacker News' },
  { key: 'grok',          label: 'Grok Tech Trends',     desc: 'Tech trends via xAI Grok search' },
  { key: 'sources_36kr',  label: '36Kr',                 desc: 'Chinese startup and tech news' },
  { key: 'wallstreetcn',  label: 'WallStreetCN',         desc: 'Chinese financial and macro news' },
  { key: 'politics',      label: 'Politics Accounts',    desc: 'X/Twitter accounts via Grok' },
  { key: 'topics',        label: 'Topics Keywords',      desc: 'Keyword searches via Grok' },
]

type SensorStatus = 'ok' | 'failed' | 'disabled'

function Badge({ status }: { status: SensorStatus | undefined }) {
  if (!status) return null
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ok:       { bg: 'var(--ok-bg)',      color: 'var(--ok)',       label: 'OK' },
    failed:   { bg: 'var(--err-bg)',     color: 'var(--err)',      label: 'Failed' },
    disabled: { bg: 'var(--surface-alt)', color: 'var(--ink-faint)', label: 'Off' },
  }
  const s = map[status]
  return (
    <span style={{
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      padding: '0.2rem 0.625rem',
      borderRadius: 999,
    }}>
      {s.label}
    </span>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 10,
        border: on ? 'none' : '1.5px solid var(--border)',
        background: on ? 'var(--accent)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 150ms, border-color 150ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: on ? 3 : 2,
        left: on ? 19 : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: on ? '#FFFFFF' : 'var(--ink-faint)',
        transition: 'left 150ms, background 150ms',
        boxShadow: on ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
      }} />
    </button>
  )
}

export function Sensors({ showToast }: Props) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, SensorStatus>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const { key } of ALL_SENSORS) defaults[key] = true
      setEnabled({ ...defaults, ...cfg.sensors_enabled })
    })
    api.getLatest().then((report) => {
      const map: Record<string, SensorStatus> = {}
      for (const key of report.sources_ok) map[key] = 'ok'
      for (const key of report.sources_failed) map[key] = 'failed'
      setStatuses(map)
    }).catch(() => {})
  }, [])

  const toggle = (key: string) => setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))

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

  const getBadge = (key: string): SensorStatus | undefined =>
    !enabled[key] ? 'disabled' : statuses[key]

  return (
    <section id="sensors" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <SectionHeader
        num="02"
        title="Sensors"
        description="Select which data sources are active in your daily intelligence pipeline."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {/* Sensor list */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: '1.5rem',
        }}>
          {ALL_SENSORS.map(({ key, label, desc }, i) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.875rem 1.25rem',
                borderBottom: i < ALL_SENSORS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1 }}>
                <Toggle on={enabled[key] ?? true} onClick={() => toggle(key)} />
                <div>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: enabled[key] ? 'var(--ink)' : 'var(--ink-faint)',
                    marginBottom: '0.125rem',
                  }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                    {desc}
                  </div>
                </div>
              </div>
              <Badge status={getBadge(key)} />
            </div>
          ))}
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
