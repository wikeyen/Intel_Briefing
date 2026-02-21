// ABOUTME: Auto-save hook — debounces config updates and exposes save status.
// ABOUTME: Used by all settings pages to replace manual "Save changes" buttons.
import { useRef, useState, useCallback, useEffect } from 'react'
import { api } from '@/api/client'
import type { ConfigSettings } from '@/api/client'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Debounced auto-save for config settings pages.
 *
 * - `trigger()` — schedule a save after `delay` ms (resets on repeated calls)
 * - `save()` — save immediately (e.g. before running a connection test)
 * - `status` — current save lifecycle state for the UI indicator
 */
export function useAutoSave(
  getPartial: () => Partial<ConfigSettings>,
  options?: { delay?: number; onError?: (err: Error) => void; onSaved?: () => void },
): { status: AutoSaveStatus; trigger: () => void; save: () => Promise<void> } {
  const delay = options?.delay ?? 800
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const getPartialRef = useRef(getPartial)
  getPartialRef.current = getPartial
  const onErrorRef = useRef(options?.onError)
  onErrorRef.current = options?.onError
  const onSavedRef = useRef(options?.onSaved)
  onSavedRef.current = options?.onSaved

  const doSave = useCallback(async () => {
    setStatus('saving')
    try {
      await api.updateConfig(getPartialRef.current())
      setStatus('saved')
      onSavedRef.current?.()
      setTimeout(() => setStatus(s => s === 'saved' ? 'idle' : s), 2000)
    } catch (e) {
      setStatus('error')
      onErrorRef.current?.(e as Error)
      setTimeout(() => setStatus(s => s === 'error' ? 'idle' : s), 3000)
    }
  }, [])

  const trigger = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(doSave, delay)
  }, [delay, doSave])

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  return { status, trigger, save: doSave }
}
