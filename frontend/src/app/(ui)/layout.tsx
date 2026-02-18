// ABOUTME: UI shell layout — wraps all dashboard pages with sidebar and toast notifications.
// ABOUTME: Provides ToastContext so any page component can trigger toasts without prop drilling.
'use client'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { ToastContext } from '@/lib/toast-context'

export default function UiLayout({ children }: { children: React.ReactNode }) {
  return (
    <Toaster>
      {(showToast) => (
        <ToastContext.Provider value={showToast}>
          <div style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', background: 'var(--canvas)' }}>
            <Sidebar showToast={showToast} />
            <main style={{
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
