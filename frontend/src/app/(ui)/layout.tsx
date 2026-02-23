// ABOUTME: UI shell layout — wraps all dashboard pages with sidebar, toast, and i18n.
// ABOUTME: Provides ToastContext and I18nProvider so any page component can use t() and toasts.
'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { ToastContext } from '@/lib/toast-context'
import { I18nProvider, useTranslation } from '@/lib/i18n'

/** i18n keys for page titles, keyed by pathname. */
const PAGE_TITLE_KEYS: Record<string, string> = {
  '/dashboard': 'page.dashboard.title',
  '/status': 'page.status.title',
  '/connections': 'page.connections.title',
  '/pipeline': 'page.pipeline.title',
  '/sources': 'page.sources.title',
  '/ai': 'page.ai.title',
  '/data': 'page.data.title',
}

/** i18n keys for page descriptions, keyed by pathname. */
const PAGE_DESC_KEYS: Record<string, string> = {
  '/dashboard': 'page.dashboard.desc',
  '/status': 'page.status.desc',
  '/connections': 'page.connections.desc',
  '/pipeline': 'page.pipeline.desc',
  '/sources': 'page.sources.desc',
  '/ai': 'page.ai.desc',
  '/data': 'page.data.desc',
}

function UiShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { t } = useTranslation()

  const mainRef = useRef<HTMLElement>(null)
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Close sidebar on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const titleKey = PAGE_TITLE_KEYS[pathname]
  const descKey = PAGE_DESC_KEYS[pathname]
  const pageTitle = titleKey ? t(titleKey) : t('app.title')
  const pageDesc = descKey ? t(descKey) : ''

  return (
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
            {sidebarOpen ? t('app.title') : pageTitle}
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
          aria-label={sidebarOpen ? t('menu.close') : t('menu.open')}
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
  )
}

export default function UiLayout({ children }: { children: React.ReactNode }) {
  return (
    <Toaster>
      {(showToast) => (
        <ToastContext.Provider value={showToast}>
          <I18nProvider>
            <UiShell>{children}</UiShell>
          </I18nProvider>
        </ToastContext.Provider>
      )}
    </Toaster>
  )
}
