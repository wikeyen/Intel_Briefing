// ABOUTME: Schedule configuration page — daily fetch time, timezone, and cache TTL.
// ABOUTME: Saves to PUT /config; shows success/error toast via callback.
import { useState, useEffect } from 'react'
import { api } from '../api/client'

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
    <section id="schedule" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">Schedule</h2>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Daily Fetch Time</label>
        <input
          type="time"
          value={fetchTime}
          onChange={(e) => setFetchTime(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 w-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">
          Cache TTL — <span className="text-white">{cacheTtl}h</span>
        </label>
        <input
          type="range"
          min={1}
          max={72}
          value={cacheTtl}
          onChange={(e) => setCacheTtl(Number(e.target.value))}
          className="accent-indigo-500"
        />
        <p className="text-xs text-gray-500">
          Cached data older than this is flagged stale. Set longer than your fetch interval to avoid gaps.
        </p>
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
