// ABOUTME: Sources section — sensor toggles grouped by language/provider with inline pill controls.
// ABOUTME: Per-sensor item limits, lookback hours, politics accounts, and topics keywords configured inline.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'
import { SectionHeader } from '@/components/SectionHeader'
import { useToast } from '@/lib/toast-context'

interface SensorDef {
  key: string
  label: string
  desc: string
}

const SENSOR_GROUPS: { label: string; sensors: SensorDef[] }[] = [
  {
    label: 'General',
    sensors: [
      { key: 'hacker_news',  label: 'Hacker News',     desc: 'Top stories from news.ycombinator.com' },
      { key: 'arxiv',        label: 'ArXiv AI',         desc: 'Latest AI/ML research preprints' },
      { key: 'github',       label: 'GitHub Trending',  desc: 'Daily trending repositories' },
      { key: 'product_hunt', label: 'Product Hunt',     desc: 'Top products of the day' },
      { key: 'hn_blogs',     label: 'HN Blogs',         desc: 'Curated blog posts from Hacker News' },
    ],
  },
  {
    label: 'Chinese / 中文',
    sensors: [
      { key: 'v2ex',         label: 'V2EX',          desc: 'Chinese tech community hot posts' },
      { key: 'sources_36kr', label: '36Kr',           desc: 'Chinese startup and tech news' },
      { key: 'wallstreetcn', label: 'WallStreetCN',   desc: 'Chinese financial and macro news' },
    ],
  },
  {
    label: 'Grok / xAI',
    sensors: [
      { key: 'grok',     label: 'Grok Tech Trends',  desc: 'Tech trends via xAI Grok search' },
      { key: 'politics', label: 'Accounts',           desc: 'X/Twitter accounts monitored via Grok' },
      { key: 'topics',   label: 'Topics Keywords',   desc: 'Keyword searches via Grok' },
    ],
  },
]

const ALL_SENSORS = SENSOR_GROUPS.flatMap((g) => g.sensors)

/** Maps sensor names to their default lookback hours. Sensors not listed have no lookback support. */
const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  grok: 24,
  politics: 48,
  topics: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
}

type SensorStatus = 'ok' | 'failed' | 'disabled'

function Badge({ status }: { status: SensorStatus | undefined }) {
  if (!status) return null
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ok:       { bg: 'var(--ok-bg)',       color: 'var(--ok)',        label: 'OK' },
    failed:   { bg: 'var(--err-bg)',      color: 'var(--err)',       label: 'Failed' },
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

interface PillInputProps {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (v: number) => void
}

function PillInput({ label, value, min, max, suffix, onChange }: PillInputProps) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      borderRadius: 999,
      border: '1px solid var(--border)',
      background: 'var(--canvas)',
      padding: '0.2rem 0.5rem 0.2rem 0.5rem',
      fontSize: '0.75rem',
      lineHeight: 1,
      cursor: 'text',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
        }}
        style={{
          width: suffix ? 28 : 32,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          fontSize: '0.75rem',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontWeight: 600,
          textAlign: 'right',
          outline: 'none',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          MozAppearance: 'textfield' as any,
        }}
      />
      {suffix && (
        <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>{suffix}</span>
      )}
    </label>
  )
}

function validateHandle(value: string): string | null {
  const clean = value.startsWith('@') ? value : `@${value}`
  if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return 'Invalid handle format'
  return null
}

function normalizeHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

/** CSS to hide number input spinners across browsers */
const HIDE_SPINNERS_CSS = `
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
`

export function Sensors() {
  const showToast = useToast()
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, SensorStatus>>({})
  const [politicsAccounts, setPoliticsAccounts] = useState<string[]>([])
  const [topicsKeywords, setTopicsKeywords] = useState<string[]>([])
  const [sensorLimits, setSensorLimits] = useState<Record<string, number>>({})
  const [sensorLookback, setSensorLookback] = useState<Record<string, number>>({})
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const { key } of ALL_SENSORS) defaults[key] = true
      setEnabled({ ...defaults, ...cfg.sensors_enabled })
      setPoliticsAccounts(cfg.politics_accounts)
      setTopicsKeywords(cfg.topics_keywords)
      setSensorLimits(cfg.sensor_limits ?? {})
      setSensorLookback(cfg.sensor_lookback_hours ?? {})
      setDefaultLimit(cfg.default_limit)
    })
    api.getLatest().then((report) => {
      const map: Record<string, SensorStatus> = {}
      for (const key of report.sources_ok) map[key] = 'ok'
      for (const key of report.sources_failed) map[key] = 'failed'
      setStatuses(map)
    }).catch(() => {})
  }, [])

  const toggle = (key: string) => setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))

  const updateSensorLimit = (key: string, value: number) =>
    setSensorLimits((prev) => ({ ...prev, [key]: value }))

  const updateSensorLookback = (key: string, value: number) =>
    setSensorLookback((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        sensors_enabled: enabled,
        politics_accounts: politicsAccounts,
        topics_keywords: topicsKeywords,
        sensor_limits: sensorLimits,
        sensor_lookback_hours: sensorLookback,
      })
      showToast('Sources saved')
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
      <style dangerouslySetInnerHTML={{ __html: HIDE_SPINNERS_CSS }} />

      <SectionHeader
        num="02"
        title="Sources"
        description="Active data sources for your pipeline, grouped by language and provider."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {SENSOR_GROUPS.map((group) => (
          <div key={group.label}>
            {/* Group label */}
            <div style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: '0.5rem',
            }}>
              {group.label}
            </div>

            {/* Sensor cards in this group */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {group.sensors.map(({ key, label, desc }, i) => {
                const isLast = i === group.sensors.length - 1
                const isPolitics = key === 'politics'
                const isTopics = key === 'topics'
                const isOn = enabled[key] ?? true
                const hasLookback = key in SENSOR_LOOKBACK_SUPPORT
                const showSubConfig = (isPolitics || isTopics) && isOn

                return (
                  <div key={key}>
                    {/* Sensor row — toggle, label, inline pills, badge */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.875rem 1.25rem',
                        borderBottom: showSubConfig || !isLast ? '1px solid var(--border-soft)' : 'none',
                        transition: 'background 120ms',
                        gap: '0.75rem',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                    >
                      {/* Left: toggle + label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                        <Toggle on={isOn} onClick={() => toggle(key)} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: isOn ? 'var(--ink)' : 'var(--ink-faint)',
                            marginBottom: '0.125rem',
                          }}>
                            {label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                            {desc}
                          </div>
                        </div>
                      </div>

                      {/* Right: inline pill controls + badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        {isOn && (
                          <PillInput
                            label="Items"
                            value={sensorLimits[key] ?? defaultLimit}
                            min={1}
                            max={50}
                            onChange={(v) => updateSensorLimit(key, v)}
                          />
                        )}
                        {isOn && hasLookback && (
                          <PillInput
                            label="Lookback"
                            value={sensorLookback[key] ?? SENSOR_LOOKBACK_SUPPORT[key]}
                            min={1}
                            max={336}
                            suffix="h"
                            onChange={(v) => updateSensorLookback(key, v)}
                          />
                        )}
                        <Badge status={getBadge(key)} />
                      </div>
                    </div>

                    {/* Inline sub-config: Politics Accounts */}
                    {isPolitics && isOn && (
                      <div style={{
                        padding: '1rem 1.25rem 1.25rem 3.5rem',
                        background: 'var(--canvas)',
                        borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                          X/Twitter handles to monitor
                        </div>
                        <TagInput
                          tags={politicsAccounts}
                          onChange={(tags) => setPoliticsAccounts(tags.map(normalizeHandle))}
                          placeholder="@handle — press Enter"
                          validate={validateHandle}
                        />
                      </div>
                    )}

                    {/* Inline sub-config: Topics Keywords */}
                    {isTopics && isOn && (
                      <div style={{
                        padding: '1rem 1.25rem 1.25rem 3.5rem',
                        background: 'var(--canvas)',
                        borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                          Keywords and hashtags to search
                        </div>
                        <TagInput
                          tags={topicsKeywords}
                          onChange={setTopicsKeywords}
                          placeholder="keyword or #hashtag — press Enter"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

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
