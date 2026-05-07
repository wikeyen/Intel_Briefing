// ABOUTME: Tests for summary helper stubs extracted from summary/trigger/route.ts.
// ABOUTME: Verifies that consolidated pipeline stubs return the correct sentinel values.
import { describe, it, expect } from 'vitest'
import { cancelSummary, isSummaryRunning } from './summary-helpers'

describe('summary-helpers', () => {
  it('cancelSummary returns false — standalone summary is consolidated into pipeline', () => {
    expect(cancelSummary()).toBe(false)
  })

  it('isSummaryRunning returns false — standalone summary is consolidated into pipeline', () => {
    expect(isSummaryRunning()).toBe(false)
  })
})
