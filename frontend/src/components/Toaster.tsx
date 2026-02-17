// ABOUTME: Stacked toast notification system — toasts appear at the top-right.
// ABOUTME: New toasts stack below existing ones; expiring toasts collapse and the rest slide up.
import { useState, useRef, useCallback } from 'react'

type Phase = 'entering' | 'visible' | 'exiting'

interface ToastItem {
  id: number
  msg: string
  phase: Phase
}

export interface ToastHandle {
  showToast: (msg: string) => void
}

interface Props {
  children: (showToast: (msg: string) => void) => React.ReactNode
}

export function Toaster({ children }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((msg: string) => {
    const id = idRef.current++

    // Mount with phase=entering (no transition, maxHeight=0)
    setToasts(prev => [...prev, { id, msg, phase: 'entering' }])

    // Next tick: flip to visible → triggers CSS transition to expand
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, phase: 'visible' } : t))
    }, 16)

    // After 3s: collapse out
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, phase: 'exiting' } : t))
      // After collapse animation: remove from DOM
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 380)
    }, 3000)
  }, [])

  return (
    <>
      {children(showToast)}

      {/* Toast container */}
      <div style={{
        position: 'fixed',
        top: '1.25rem',
        right: '1.5rem',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {toasts.map(({ id, msg, phase }) => (
          // Outer wrapper controls layout height (for slide-up effect)
          <div
            key={id}
            style={{
              overflow: 'hidden',
              maxHeight: phase === 'visible' ? 80 : 0,
              opacity: phase === 'visible' ? 1 : 0,
              transition: phase === 'entering'
                ? 'none'
                : 'max-height 360ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease',
            }}
          >
            {/* Inner: the visible pill + gap below it */}
            <div style={{ paddingBottom: '0.5rem' }}>
              <div style={{
                background: 'var(--ink)',
                color: '#FFFFFF',
                fontSize: '0.875rem',
                fontWeight: 500,
                padding: '0.75rem 1.125rem',
                borderRadius: 4,
                boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {msg}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
