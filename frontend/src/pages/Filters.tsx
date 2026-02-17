// ABOUTME: Filters page — boost and suppress keyword lists for ranking pipeline.
// ABOUTME: Two independent tag inputs; saves both lists to PUT /config.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { TagInput } from '../components/TagInput'

interface Props {
  showToast: (msg: string) => void
}

export function Filters({ showToast }: Props) {
  const [boost, setBoost] = useState<string[]>([])
  const [suppress, setSuppress] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setBoost(cfg.boost_keywords)
      setSuppress(cfg.suppress_keywords)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ boost_keywords: boost, suppress_keywords: suppress })
      showToast('Filters saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="filters" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">Filters</h2>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Boost Keywords</label>
        <p className="text-xs text-gray-500">Items matching these keywords rank higher in their section.</p>
        <TagInput
          tags={boost}
          onChange={setBoost}
          placeholder="keyword — press Enter"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Suppress Keywords</label>
        <p className="text-xs text-gray-500">Items matching these keywords are filtered out entirely.</p>
        <TagInput
          tags={suppress}
          onChange={setSuppress}
          placeholder="keyword — press Enter"
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
