// ABOUTME: Output settings page — language toggle, global limit, and per-section limit sliders.
// ABOUTME: Saves default_language, default_limit, and section_limits to PUT /config.
import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Props {
  showToast: (msg: string) => void
}

const SECTIONS = [
  'tech_trends',
  'research',
  'insights',
  'products',
  'capital_flow',
  'community',
  'politics',
  'topics',
]

export function Output({ showToast }: Props) {
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [sectionLimits, setSectionLimits] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setLang((cfg.default_language as 'en' | 'zh') ?? 'en')
      setDefaultLimit(cfg.default_limit)
      setSectionLimits(cfg.section_limits ?? {})
    })
  }, [])

  const updateSection = (section: string, value: number) =>
    setSectionLimits((prev) => ({ ...prev, [section]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        default_language: lang,
        default_limit: defaultLimit,
        section_limits: sectionLimits,
      })
      showToast('Output settings saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="output" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">Output</h2>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Language</label>
        <div className="flex gap-3">
          {(['en', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                lang === l
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {l === 'en' ? 'English' : 'Chinese'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">
          Default Items per Section — <span className="text-white">{defaultLimit}</span>
        </label>
        <input
          type="range"
          min={3}
          max={50}
          value={defaultLimit}
          onChange={(e) => setDefaultLimit(Number(e.target.value))}
          className="accent-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm text-gray-400">Per-Section Overrides</label>
        {SECTIONS.map((section) => {
          const val = sectionLimits[section] ?? defaultLimit
          return (
            <div key={section} className="flex items-center gap-4">
              <span className="text-sm text-gray-300 w-32 shrink-0">{section}</span>
              <input
                type="range"
                min={1}
                max={50}
                value={val}
                onChange={(e) => updateSection(section, Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-sm text-white w-6 text-right">{val}</span>
            </div>
          )
        })}
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
