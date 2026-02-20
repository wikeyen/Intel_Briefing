// ABOUTME: Schedule footer for the Status page — Zone 3 of the redesign.
// ABOUTME: Shows the next scheduled pipeline run time with a live countdown.
import type { ConfigSettings } from '@/api/client'
import { nextFetchIn } from './time-helpers'

export interface ScheduleFooterProps {
  config: ConfigSettings | null
}

export function ScheduleFooter({ config }: ScheduleFooterProps) {
  if (!config) {
    return (
      <div style={{
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--ink-faint)',
        padding: '1.5rem 0 0',
      }}>
        No scheduled run configured
      </div>
    )
  }

  return (
    <div style={{
      textAlign: 'center',
      fontSize: '0.75rem',
      color: 'var(--ink-muted)',
      padding: '1.5rem 0 0',
    }}>
      Next run:{' '}
      <span style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
        {config.fetch_time}
      </span>
      <span style={{ color: 'var(--ink-faint)', margin: '0 0.375rem' }}>&middot;</span>
      {nextFetchIn(config.fetch_time, config.fetch_timezone)}
      <span style={{ color: 'var(--ink-faint)', margin: '0 0.375rem' }}>&middot;</span>
      {config.fetch_timezone}
    </div>
  )
}
