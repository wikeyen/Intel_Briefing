// ABOUTME: Politics accounts page — manage X/Twitter handles monitored via Grok.
// ABOUTME: Tag input for handle list; preview panel shows latest politics items.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { IntelItem } from '../api/client'
import { TagInput } from '../components/TagInput'

interface Props {
  showToast: (msg: string) => void
}

function validateHandle(value: string): string | null {
  const clean = value.startsWith('@') ? value : `@${value}`
  if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return 'Invalid handle format'
  return null
}

function normalizeHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

export function PoliticsAccounts({ showToast }: Props) {
  const [accounts, setAccounts] = useState<string[]>([])
  const [preview, setPreview] = useState<IntelItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => setAccounts(cfg.politics_accounts))
    api.getLatest().then((report) => {
      setPreview(report.items['politics'] ?? [])
    }).catch(() => {})
  }, [])

  const handleAdd = (tags: string[]) => {
    // normalize all handles to start with @
    setAccounts(tags.map(normalizeHandle))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ politics_accounts: accounts })
      showToast('Politics accounts saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="politics" className="max-w-2xl flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-white">Politics Accounts</h2>
      <p className="text-sm text-gray-400">
        X/Twitter handles to monitor via Grok. Requires xAI API key.
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-400">Handles</label>
        <TagInput
          tags={accounts}
          onChange={handleAdd}
          placeholder="@handle — press Enter"
          validate={validateHandle}
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
          <h3 className="text-sm font-medium text-gray-400">Latest Politics Items</h3>
          {preview.map((item) => (
            <div key={item.id} className="bg-gray-800 rounded px-4 py-3 flex flex-col gap-1">
              <div className="text-xs text-indigo-400">{item.account ?? item.handle}</div>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-100 hover:text-white"
              >
                {item.title}
              </a>
              {item.published_at && (
                <div className="text-xs text-gray-500">
                  {item.published_at.slice(0, 16).replace('T', ' ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
