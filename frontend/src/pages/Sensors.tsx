// ABOUTME: Sensor toggle page — enable/disable each data source individually.
// ABOUTME: Shows OK/FAILED/DISABLED badge per sensor based on latest fetch results.
import { useState, useEffect } from 'react'
import { api } from '../api/client'

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

  const badge = (key: string) => {
    if (!enabled[key]) return <span className="text-xs text-gray-500 font-medium">DISABLED</span>
    const s = statuses[key]
    if (!s) return null
    return s === 'ok'
      ? <span className="text-xs text-green-400 font-medium">OK</span>
      : <span className="text-xs text-red-400 font-medium">FAILED</span>
  }

  return (
    <section id="sensors" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">Sensors</h2>
      <div className="flex flex-col gap-3">
        {ALL_SENSORS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between bg-gray-800 rounded px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={enabled[key] ?? true}
                onClick={() => toggle(key)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  enabled[key] ? 'bg-indigo-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    enabled[key] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-200">{label}</span>
            </div>
            {badge(key)}
          </div>
        ))}
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="self-start bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded transition-colors"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </section>
  )
}
