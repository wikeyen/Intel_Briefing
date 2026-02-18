// ABOUTME: Toast notification context for sharing showToast across the component tree.
// ABOUTME: Replaces prop-drilling of showToast through Layout into page components.
'use client'
import { createContext, useContext } from 'react'

export const ToastContext = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}
