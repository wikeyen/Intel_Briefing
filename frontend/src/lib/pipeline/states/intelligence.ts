// ABOUTME: Intelligence state handler — runs trend/topic/account analysis via LLM.
// ABOUTME: Uses the deduplicated runIntelligence helper from helpers.ts.

import { runIntelligence } from '../helpers'
import type { PipelineContext, PipelineState } from '../types'

/**
 * Intelligence state: run intelligence analysis (trend, topic, account) using the LLM.
 * Delegates to the deduplicated `runIntelligence` helper.
 *
 * Returns: 'complete'
 */
export async function handleIntelligence(ctx: PipelineContext): Promise<PipelineState> {
  const { config, signal, tracker, llmConfig } = ctx

  const intelligenceReport = ctx.report ?? ctx.cachedReport
  if (llmConfig && intelligenceReport && !signal.aborted) {
    await runIntelligence(
      intelligenceReport,
      llmConfig,
      signal,
      config.summary_language,
      tracker,
    )
  }

  return 'complete'
}
