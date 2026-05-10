// ABOUTME: Client-side UI shell — sidebar, toast, i18n provider with locale from cookie.
// ABOUTME: Manages sidebar pin/collapse/peek states; receives initialLocale from server layout to prevent language flash.
'use client'
import { useState, useCallback, useEffect, useRef, type RefObject } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { ToastContext } from '@/lib/toast-context'
import { I18nProvider, useTranslation } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/types'
import { PipelineHaltBanner } from '@/components/PipelineHaltBanner'

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

function UiShell({ children, initialPinned }: { children: React.ReactNode; initialPinned?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(initialPinned ?? false)
  const [sidebarPeeking, setSidebarPeeking] = useState(false)
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()
  const { t } = useTranslation()

  // Close mobile sidebar on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false)
  }, [pathname])

  const mainRef = useRef<HTMLElement>(null) as RefObject<HTMLElement>
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Clear peek timeout on unmount
  useEffect(() => {
    return () => {
      if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current)
    }
  }, [])

  const togglePinned = useCallback(() => {
    setSidebarPinned(prev => {
      const next = !prev
      // Persist: cookie stores '1' for collapsed (unpinned), '0' for pinned
      try { localStorage.setItem('ib:sidebar:pinned', next ? '1' : '0') } catch {}
      try { document.cookie = `intel-sidebar=${next ? '0' : '1'}; path=/; max-age=31536000; SameSite=Lax` } catch {}
      return next
    })
    // When pinning open, clear peek state
    setSidebarPeeking(false)
  }, [])

  // Hover handlers for peek behavior (collapsed sidebar only)
  const handleSidebarMouseEnter = useCallback(() => {
    if (sidebarPinned) return
    if (peekTimeoutRef.current) {
      clearTimeout(peekTimeoutRef.current)
      peekTimeoutRef.current = null
    }
    setSidebarPeeking(true)
  }, [sidebarPinned])

  const handleSidebarMouseLeave = useCallback(() => {
    if (sidebarPinned) return
    peekTimeoutRef.current = setTimeout(() => {
      setSidebarPeeking(false)
      peekTimeoutRef.current = null
    }, 200)
  }, [sidebarPinned])

  const titleKey = PAGE_TITLE_KEYS[pathname]
  const descKey = PAGE_DESC_KEYS[pathname]
  const pageTitle = titleKey ? t(titleKey) : t('app.title')
  const pageDesc = descKey ? t(descKey) : ''

  // Determine if sidebar should render in collapsed mode
  // Collapsed visually when unpinned and NOT peeking; never collapsed on mobile (sidebarOpen)
  const sidebarCollapsedVisual = !sidebarPinned && !sidebarPeeking && !sidebarOpen

  return (
    <div
      className={`${sidebarOpen ? 'sidebar-open' : ''} ${!sidebarPinned ? 'sidebar-unpinned' : ''}`}
      style={{ display: 'flex', flex: 1, height: '100dvh', overflow: 'hidden', background: 'var(--canvas)' }}
    >
      {/* Mobile top bar — tap to scroll to top, hamburger to toggle menu */}
      <div className="mobile-top-bar" onClick={() => mainRef.current?.scrollTo({ top: 0 })}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <span style={{
            fontSize: sidebarOpen ? '0.8125rem' : '0.875rem',
            fontWeight: sidebarOpen ? 700 : 600,
            letterSpacing: sidebarOpen ? '0.08em' : '-0.01em',
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

      <div
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <Sidebar
          onNavigate={closeSidebar}
          collapsed={sidebarCollapsedVisual}
          peeking={sidebarPeeking}
          pinned={sidebarPinned}
          onPinToggle={togglePinned}
        />
      </div>

      <main ref={mainRef} className="main-content" style={{
        flex: 1,
        height: '100dvh',
        overflowY: 'auto',
        scrollBehavior: 'smooth',
      }}>
        <PipelineHaltBanner />
        {children}
      </main>
    </div>
  )
}

export function UiLayoutClient({ children, initialLocale, initialCollapsed }: { children: React.ReactNode; initialLocale?: Locale; initialCollapsed?: boolean }) {
  return (
    <Toaster>
      {(showToast) => (
        <ToastContext.Provider value={showToast}>
          <I18nProvider initialLocale={initialLocale}>
            <UiShell initialPinned={initialCollapsed === undefined ? undefined : !initialCollapsed}>{children}</UiShell>
          </I18nProvider>
        </ToastContext.Provider>
      )}
    </Toaster>
  )
}
