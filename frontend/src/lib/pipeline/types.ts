// ABOUTME: Shared types for the pipeline state machine — states, context, pause actions.
// ABOUTME: Centralises all state-machine types so handlers and helpers can import from one place.

import type { ConfigSettings, IntelReport, RunMode, BriefingSummary, SummaryProgress } from '../models'
import type { PipelineProgressTracker } from './progress'
import type { LlmConfig } from '../summary/llm'
import type { SummaryProgressCallback, SummarizeOptions } from '../summary/summarizer'
import type { createBus } from '../summary/events'

export type PipelineState =
  | 'setup' | 'fetching'
  | 'summarizing' | 'summary_retry' | 'paused'
  | 'briefing' | 'intelligence'
  | 'complete' | 'cancelled'

export type PauseAction =
  | { type: 'retry_sensor'; sensor: string }
  | { type: 'retry_all' }
  | { type: 'skip_sensor'; sensor: string }
  | { type: 'generate_overall' }
  | { type: 'cancel' }

export type FailureKind = 'api' | 'config' | 'summary'

export type StateHandler = (ctx: PipelineContext) => Promise<PipelineState>

export interface PipelineContext {
  // Immutable after setup
  config: ConfigSettings
  signal: AbortSignal
  abortController: AbortController
  mode: RunMode
  allEnabledSensors: string[]
  sensorsToFetch: string[]
  trackerSensorNames: string[]
  llmConfig: LlmConfig | null
  concurrency: number
  summaryConcurrency: number
  isIncrementalRun: boolean
  sensorFilter?: string[]

  // Mutable shared state
  tracker: PipelineProgressTracker
  report: IntelReport | null
  summary: BriefingSummary | null
  cachedReport: IntelReport | null
  cachedSensorItems: Map<string, { items: unknown[]; fetchedAt: string }>
  failures: Set<string>
  failureKinds: Map<string, FailureKind>
  skippedSensors: Set<string>
  sensorSkips: Map<string, () => void>
  skipRetries: boolean
  enabledSensors: Set<string>

  // Summary cross-page state
  summaryStatus: SummaryProgress | null
  summaryBus: ReturnType<typeof createBus> | null
  onProgress: SummaryProgressCallback | null
  baseSummarizeOpts: SummarizeOptions | null

  // Pause/resume channel
  pauseResolve: ((action: PauseAction) => void) | null

  // Optional caller controls
  stopAfterSummary: boolean
}

