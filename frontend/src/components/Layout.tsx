// Sidebar navigation layout with health status indicator and Fetch Now button.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../api/client'

const NAV_LINKS = [
  { href: '#api-keys', label: 'API Keys' },
  { href: '#sensors', label: 'Sensors' },
  { href: '#schedule', label: 'Schedule' },
  { href: '#politics', label: 'Politics Accounts' },
  { href: '#topics', label: 'Topics' },
  { href: '#filters', label: 'Filters' },
  { href: '#output', label: 'Output' },
]

interface Props {
  children: ReactNode
}

export function Layout({ children }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [fetching, setFetching] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', last_fetch: null }))
    const interval = setInterval(() => {
      api.health().then(setHealth).catch(() => {})
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleFetchNow = async () => {
    setFetching(true)
    try {
      await api.triggerFetch()
      showToast('Pipeline triggered — data will update shortly')
    } catch (e) {
      showToast('Fetch failed: ' + (e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const statusColor =
    health?.status === 'ok'
      ? 'bg-green-500'
      : health?.status === 'stale'
      ? 'bg-yellow-400'
      : 'bg-red-500'

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4 gap-1 shrink-0">
        <div className="text-lg font-bold text-white mb-4">Intel Briefing</div>
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm"
          >
            {link.label}
          </a>
        ))}
      </nav>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            {health
              ? `${health.status}${health.last_fetch ? ` · ${health.last_fetch.slice(0, 16).replace('T', ' ')}` : ''}`
              : 'loading…'}
          </div>
          <button
            onClick={handleFetchNow}
            disabled={fetching}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded transition-colors"
          >
            {fetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-800 border border-gray-700 text-sm text-white px-4 py-3 rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
