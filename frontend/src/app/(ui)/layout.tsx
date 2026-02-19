// ABOUTME: UI shell layout — wraps all dashboard pages with sidebar and toast notifications.
// ABOUTME: Provides ToastContext so any page component can trigger toasts without prop drilling.
'use client'
import { useState, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { ToastContext } from '@/lib/toast-context'

export default function UiLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return (
    <Toaster>
      {(showToast) => (
        <ToastContext.Provider value={showToast}>
          <div
            className={sidebarOpen ? 'sidebar-open' : ''}
            style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', background: 'var(--canvas)' }}
          >
            {/* Hamburger button — visible only on mobile via CSS */}
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {sidebarOpen
                  ? <><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></>
                  : <><line x1="3" y1="5" x2="17" y2="5" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="15" x2="17" y2="15" /></>
                }
              </svg>
            </button>

            {/* Backdrop — visible only on mobile when sidebar is open */}
            <div className="sidebar-backdrop" onClick={closeSidebar} />

            <Sidebar showToast={showToast} onNavigate={closeSidebar} />
            <main className="main-content" style={{
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
