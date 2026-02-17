// ABOUTME: Topics page — manage keywords and hashtags searched via Grok.
// ABOUTME: Tag input for keyword list; preview panel shows latest topics items.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { IntelItem } from '../api/client'
import { TagInput } from '../components/TagInput'

interface Props {
  showToast: (msg: string) => void
}

export function Topics({ showToast }: Props) {
  const [keywords, setKeywords] = useState<string[]>([])
  const [preview, setPreview] = useState<IntelItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => setKeywords(cfg.topics_keywords))
    api.getLatest().then((report) => {
      setPreview(report.items['topics'] ?? [])
    }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ topics_keywords: keywords })
      showToast('Topics saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="topics" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">Topics</h2>
      <p className="text-sm text-gray-400">
        Keywords and hashtags to search via Grok. Requires xAI API key.
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Keywords / Hashtags</label>
        <TagInput
          tags={keywords}
          onChange={setKeywords}
          placeholder="keyword or #hashtag — press Enter"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="self-start bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded transition-colors"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      {preview.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-400">Latest Topics Items</h3>
          {preview.map((item) => (
            <div key={item.id} className="bg-gray-800 rounded px-4 py-3 flex flex-col gap-1">
              {item.topic && (
                <div className="text-xs text-indigo-400">{item.topic}</div>
              )}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-100 hover:text-white"
              >
                {item.title}
              </a>
              {item.handle && (
                <div className="text-xs text-gray-500">{item.handle}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
