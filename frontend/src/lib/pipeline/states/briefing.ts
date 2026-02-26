// ABOUTME: Briefing state handler — generates the overall executive briefing.
// ABOUTME: Only runs when summary exists and overall was deferred (fetch failures were present).

import { generateOverallBriefing } from '../../summary/summarizer'
import { writeSummary } from '../../summary/cache'
import type { PipelineContext, PipelineState } from '../types'

/**
 * Briefing state: generate the overall executive briefing if it was deferred
 * (because fetch failures existed during the summarize stage).
 * Also persists the completed summary to cache.
 *
 * Returns: 'intelligence'
 */
export async function handleBriefing(ctx: PipelineContext): Promise<PipelineState> {
  const { config, signal, tracker, summary, baseSummarizeOpts } = ctx

  const sourceReport = ctx.report ?? ctx.cachedReport
  const hasFetchFailures = ctx.failures.size > 0

  // Generate overall briefing: only needed when it was deferred (fetch failures present)
  if (hasFetchFailures && summary && sourceReport && !signal.aborted && baseSummarizeOpts) {
    tracker.setOverallSummary('running')
    const overall = await generateOverallBriefing(
      sourceReport,
      summary.sections,
      baseSummarizeOpts,
    )
    ctx.summary = { ...summary, overall }
  }

  // Write summary after overall briefing is done
  if (ctx.summary && !signal.aborted) {
    try {
      await writeSummary(ctx.summary, config.summary_language)
    } catch (err) {
      console.error('Failed to write summary cache:', err)
    }
  }

  return 'intelligence'
}
