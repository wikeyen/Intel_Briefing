// ABOUTME: Summary helper functions extracted from route.ts to avoid Next.js route export validation errors.

/** Cancel the running standalone summary, if any. Returns true if cancelled. */
export function cancelSummary(): boolean {
  // Consolidated: standalone summaries now run through the pipeline,
  // so cancellation is handled by cancelPipeline() in the stop route.
  return false
}

/** Check whether a standalone summary is currently running. */
export function isSummaryRunning(): boolean {
  // Consolidated: standalone summaries now run through the pipeline.
  return false
}
