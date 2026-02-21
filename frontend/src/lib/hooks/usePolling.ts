// ABOUTME: Generic polling hook — calls a fetcher on mount and at a fixed interval.
// ABOUTME: Handles cleanup and silent error swallowing for background polls.
import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Polls a fetcher function on mount and at a fixed interval.
 * Returns the latest data (null until first successful fetch).
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  fallback?: T,
): T | null {
  const [data, setData] = useState<T | null>(fallback ?? null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      fetcherRef.current().then(d => { if (!cancelled) setData(d) }).catch(() => {})
    }
    poll()
    const iv = setInterval(poll, intervalMs)
    return () => { cancelled = true; clearInterval(iv) }
  }, [intervalMs])

  return data
}

/**
 * Runs a poll function on mount and at a fixed interval.
 * Unlike usePolling, this doesn't manage state — the caller
 * handles state updates in the callback.
 */
export function usePollEffect(
  callback: () => void,
  intervalMs: number,
): void {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    cbRef.current()
    const iv = setInterval(() => cbRef.current(), intervalMs)
    return () => clearInterval(iv)
  }, [intervalMs])
}
