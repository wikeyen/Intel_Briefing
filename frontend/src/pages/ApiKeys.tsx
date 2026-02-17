// ABOUTME: API key management page — masked inputs with reveal toggles for each key.
// ABOUTME: Saves to PUT /config; shows success/error toast via callback.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { ConfigSettings } from '../api/client'

interface Props {
  showToast: (msg: string) => void
}

const KEY_FIELDS: { field: keyof ConfigSettings; label: string }[] = [
  { field: 'gemini_api_key', label: 'Gemini API Key' },
  { field: 'xai_api_key', label: 'xAI API Key' },
  { field: 'github_token', label: 'GitHub Token' },
  { field: 'producthunt_token', label: 'Product Hunt Token' },
]

function MaskedInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-gray-400">{label}</label>
      <div className="flex gap-2">
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="not set"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="text-xs text-gray-400 hover:text-white px-2"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

export function ApiKeys({ showToast }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [xaiModel, setXaiModel] = useState('')
  const [xaiBaseUrl, setXaiBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const v: Record<string, string> = {}
      for (const { field } of KEY_FIELDS) {
        const raw = cfg[field] as string | null
        v[field] = raw === '***' || !raw ? '' : raw
      }
      setValues(v)
      setXaiModel(cfg.xai_model)
      setXaiBaseUrl(cfg.xai_base_url)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const partial: Partial<ConfigSettings> = { xai_model: xaiModel, xai_base_url: xaiBaseUrl }
      for (const { field } of KEY_FIELDS) {
        const v = values[field]
        if (v) (partial as Record<string, string>)[field] = v
      }
      await api.updateConfig(partial)
      showToast('API keys saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="api-keys" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">API Keys</h2>
      {KEY_FIELDS.map(({ field, label }) => (
        <MaskedInput
          key={field}
          label={label}
          value={values[field] ?? ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [field]: v }))}
        />
      ))}
      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">xAI Model</label>
        <input
          type="text"
          value={xaiModel}
          onChange={(e) => setXaiModel(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">xAI Base URL</label>
        <input
          type="text"
          value={xaiBaseUrl}
          onChange={(e) => setXaiBaseUrl(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
        />
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
