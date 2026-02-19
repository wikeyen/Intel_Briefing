// ABOUTME: Stacked toast notification system — toasts slide in from the right edge.
// ABOUTME: On exit, content slides back out first, then height collapses so lower toasts slide up.
'use client'
import { useState, useRef, useCallback } from 'react'

type Phase = 'entering' | 'visible' | 'exiting'

interface ToastItem {
  id: number
  msg: string
  phase: Phase
}

interface Props {
  children: (showToast: (msg: string) => void) => React.ReactNode
}

export function Toaster({ children }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((msg: string) => {
    const id = idRef.current++

    setToasts(prev => [...prev, { id, msg, phase: 'entering' }])

    // Next paint: flip to visible — triggers slide-in + height expand
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, phase: 'visible' } : t))
    }, 16)

    // After 3s: slide out, then collapse height
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, phase: 'exiting' } : t))
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 420) // content exit (220ms) + height collapse delay (180ms) + collapse (320ms) — with some buffer
    }, 3000)
  }, [])

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs */}
      {children(showToast)}

      <div className="toast-container" style={{
        position: 'fixed',
        top: '1.25rem',
        right: '1.5rem',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {toasts.map(({ id, msg, phase }) => {
          const isVisible = phase === 'visible'
          const isEntering = phase === 'entering'

          // Outer wrapper: controls the layout height for slide-up effect
          const outerTransition = isEntering
            ? 'none'
            : isVisible
            ? 'max-height 360ms cubic-bezier(0.4,0,0.2,1), opacity 0ms'
            : 'max-height 320ms cubic-bezier(0.4,0,0.2,1) 200ms' // delayed on exit so content goes first

          // Inner: controls the visual slide from/to right edge
          const innerTransition = isEntering
            ? 'none'
            : 'transform 240ms cubic-bezier(0.25,0,0,1), opacity 200ms ease'

          return (
            <div
              key={id}
              style={{
                overflow: 'hidden',
                maxHeight: isVisible ? 72 : 0,
                transition: outerTransition,
              }}
            >
              {/* Gap below each toast — collapses with the wrapper */}
              <div style={{ paddingBottom: '0.5rem' }}>
                <div style={{
                  background: 'var(--ink)',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  padding: '0.75rem 1.125rem',
                  borderRadius: 4,
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                  transform: isVisible ? 'translateX(0)' : 'translateX(calc(100% + 1.5rem))',
                  opacity: isVisible ? 1 : 0,
                  transition: innerTransition,
                }}>
                  {msg}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
