// ABOUTME: UI shell layout — wraps all dashboard pages with sidebar and toast notifications.
// ABOUTME: Provides ToastContext so any page component can trigger toasts without prop drilling.
'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { ToastContext } from '@/lib/toast-context'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/status': 'Status',
  '/connections': 'Credentials',
  '/pipeline': 'Pipeline',
  '/sources': 'Sources',
  '/ai': 'AI Summary',
  '/data': 'Feed',
}

const PAGE_DESCS: Record<string, string> = {
  '/dashboard': 'Executive summary, sentiment, and trending',
  '/status': 'Pipeline health, briefing, and sensor errors',
  '/connections': 'Credentials for data sources and AI',
  '/pipeline': 'Scheduling, filters, and output limits',
  '/sources': 'Active data sources for your pipeline',
  '/ai': 'LLM provider, model, and prompts',
  '/data': 'AI summary and items from all sources',
}

export default function UiLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const mainRef = useRef<HTMLElement>(null)
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Close sidebar on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const pageTitle = PAGE_TITLES[pathname] ?? 'Intel Briefing'
  const pageDesc = PAGE_DESCS[pathname] ?? ''

  return (
    <Toaster>
      {(showToast) => (
        <ToastContext.Provider value={showToast}>
          <div
            className={sidebarOpen ? 'sidebar-open' : ''}
            style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', background: 'var(--canvas)' }}
          >
            {/* Mobile top bar — tap to scroll to top, hamburger to toggle menu */}
            <div className="mobile-top-bar" onClick={() => mainRef.current?.scrollTo({ top: 0 })}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                <span style={{
                  fontSize: sidebarOpen ? '0.625rem' : '0.875rem',
                  fontWeight: sidebarOpen ? 700 : 600,
                  letterSpacing: sidebarOpen ? '0.16em' : '-0.01em',
                  textTransform: sidebarOpen ? 'uppercase' : 'none' as const,
                  color: 'var(--sb-ink)',
                  fontFamily: sidebarOpen ? 'ui-monospace, monospace' : 'inherit',
                  transition: 'font-size 200ms ease, letter-spacing 200ms ease',
                  lineHeight: 1.2,
                }}>
                  {sidebarOpen ? 'Intel Briefing' : pageTitle}
                </span>
                {!sidebarOpen && pageDesc && (
                  <span style={{
                    fontSize: '0.6875rem',
                    color: 'var(--sb-muted)',
                    lineHeight: 1.3,
                    marginTop: '0.125rem',
                  }}>
                    {pageDesc}
                  </span>
                )}
              </div>
              <button
                className="mobile-menu-btn"
                onClick={(e) => { e.stopPropagation(); setSidebarOpen(o => !o) }}
                aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  {sidebarOpen
                    ? <><line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" /></>
                    : <><line x1="2" y1="4.5" x2="16" y2="4.5" /><line x1="2" y1="9" x2="12" y2="9" /><line x1="2" y1="13.5" x2="16" y2="13.5" /></>
                  }
                </svg>
              </button>
            </div>

            {/* Backdrop — visible only on mobile when sidebar is open */}
            <div className="sidebar-backdrop" onClick={closeSidebar} />

            <Sidebar onNavigate={closeSidebar} />
            <main ref={mainRef} className="main-content" style={{
              flex: 1,
              height: '100vh',
              overflowY: 'auto',
              scrollBehavior: 'smooth',
            }}>
              {children}
            </main>
          </div>
        </ToastContext.Provider>
      )}
    </Toaster>
  )
}
