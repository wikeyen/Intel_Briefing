// ABOUTME: Persistent banner shown across all pages when the pipeline halts after retry exhaustion.
// ABOUTME: Offers "Retry Failed" and "Skip & Continue" actions to resume the pipeline.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'

/** Poll pipeline status and show a halt banner when paused at pre_overall with failed sensors. */
export function PipelineHaltBanner() {
  const { t } = useTranslation()
  const showToast = useToast()
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [acting, setActing] = useState(false)

  // Poll pipeline status
  useEffect(() => {
    let cancelled = false
    const poll = () => {
      api.getPipelineStatus()
        .then(s => { if (!cancelled) setStatus(s) })
        .catch(() => {})
    }
    poll()
    const isActive = status?.running || status?.paused
    const iv = setInterval(poll, isActive ? 3_000 : 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [status?.running, status?.paused])

  const isHalted = status?.paused && status?.paused_stage === 'pre_overall' && status?.alive
  const fetchFailed = status?.sensors.filter(s => s.fetch === 'failed') ?? []
  const summaryFailed = status?.sensors.filter(s => s.summary === 'failed' && s.fetch !== 'failed') ?? []
  const failedCount = fetchFailed.length + summaryFailed.length

  const handleRetry = useCallback(async () => {
    setActing(true)
    try {
      await api.resumePipeline('retry_all')
      showToast(t('halt.retry') + '\u2026')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setActing(false)
    }
  }, [showToast, t])

  const handleSkip = useCallback(async () => {
    setActing(true)
    try {
      await api.resumePipeline('generate_overall')
      showToast(t('halt.skip') + '\u2026')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setActing(false)
    }
  }, [showToast, t])

  if (!isHalted || failedCount === 0) return null

  return (
    <div style={{
      background: 'var(--warn-tint)',
      border: '1px solid var(--warn-border)',
      borderRadius: 8,
      padding: '0.75rem 1rem',
      margin: '0.75rem 0.75rem 0',
    }}>
      <div className="halt-banner-layout" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--warn)',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--warn-text)',
            whiteSpace: 'nowrap',
          }}>
            {t('halt.title')}
          </span>
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--ink-muted)',
          }}>
            {fetchFailed.length > 0 && summaryFailed.length > 0
              ? t('halt.message_mixed', { fetchCount: String(fetchFailed.length), summaryCount: String(summaryFailed.length) })
              : summaryFailed.length > 0
              ? t('halt.message_summary', { count: String(summaryFailed.length) })
              : t('halt.message', { count: String(failedCount) })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button
            onClick={handleRetry}
            disabled={acting}
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--ink-muted)',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '0.375rem 0.75rem',
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.5 : 1,
              transition: 'border-color 100ms',
            }}
          >
            {t('halt.retry')}
          </button>
          <button
            onClick={handleSkip}
            disabled={acting}
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--canvas)',
              background: 'var(--ink)',
              border: 'none',
              borderRadius: 4,
              padding: '0.375rem 0.75rem',
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.5 : 1,
              transition: 'background 100ms',
            }}
          >
            {t('halt.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
