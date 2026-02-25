// ABOUTME: Pipeline progress tracker — manages two-stage pipeline state via observer pattern.
// ABOUTME: Decouples state transitions from persistence; callers subscribe via onChange callback.
import type { PipelineStatus, SensorJobProgress, StageState, RunMode, PipelineEvent, PipelineEventLevel, PipelinePhase } from '../models'

type OnChangeCallback = (status: PipelineStatus) => void

/**
 * Manages pipeline execution state for all sensors across fetch and summary stages.
 * State changes are broadcast to an onChange listener (typically SQLite persistence).
 */
export class PipelineProgressTracker {
  private readonly sensors: SensorJobProgress[]
  private readonly mode: RunMode
  private readonly runId: string
  private readonly defaultConcurrency: number
  private readonly localSummaryConcurrency: number
  private readonly onChange?: OnChangeCallback
  private readonly startedAt: string
  private completedAt: string | null = null
  private running = true
  private cancelled = false
  private paused = false
  private pausedStage: 'fetch' | 'summary' | 'pre_overall' | null = null
  private retryAttempt = 0
  private retryMax = 0
  private overallSummary: StageState
  private readonly events: PipelineEvent[] = []
  private static readonly MAX_EVENTS = 200

  constructor(
    sensorNames: string[],
    mode: RunMode,
    defaultConcurrency: number,
    localSummaryConcurrency: number,
    onChange?: OnChangeCallback,
  ) {
    this.mode = mode
    this.runId = Date.now().toString(36) + Math.random().toString(36).slice(2)
    this.defaultConcurrency = defaultConcurrency
    this.localSummaryConcurrency = localSummaryConcurrency
    this.onChange = onChange
    this.startedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

    const skipFetch = mode === 'summarize'
    const skipSummary = mode === 'fetch'

    this.sensors = sensorNames.map(name => ({
      name,
      fetch: skipFetch ? 'skipped' : 'queued',
      fetch_error: null,
      fetch_error_kind: null,
      fetch_detail: null,
      fetch_started_at: null,
      fetch_cached: false,
      summary: skipSummary ? 'skipped' : 'queued',
      summary_error: null,
      item_count: 0,
      summary_chunks_total: 0,
      summary_chunks_done: 0,
      verify_attempt: 0,
      verify_max_retries: 0,
      verify_failures: 0,
    }))

    this.overallSummary = skipSummary ? 'skipped' : 'queued'
  }

  private find(name: string): SensorJobProgress {
    const s = this.sensors.find(s => s.name === name)
    if (!s) throw new Error(`Unknown sensor: ${name}`)
    return s
  }

  private notify(): void {
    this.onChange?.(this.snapshot())
  }

  /** Append a structured event to the pipeline log. Capped at MAX_EVENTS entries. */
  addEvent(level: PipelineEventLevel, phase: PipelinePhase, message: string, sensor?: string): void {
    const event: PipelineEvent = {
      ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      level,
      phase,
      message,
      ...(sensor ? { sensor } : {}),
    }
    this.events.push(event)
    if (this.events.length > PipelineProgressTracker.MAX_EVENTS) {
      this.events.splice(0, this.events.length - PipelineProgressTracker.MAX_EVENTS)
    }
    this.notify()
  }

  setFetchState(
    name: string,
    state: StageState,
    itemCount?: number,
    error?: string | null,
    errorKind?: 'config' | 'api' | null,
  ): void {
    const s = this.find(name)
    s.fetch = state
    if (state === 'running') s.fetch_started_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    if (itemCount !== undefined) s.item_count = itemCount
    if (error !== undefined) s.fetch_error = error
    if (errorKind !== undefined) s.fetch_error_kind = errorKind
    if (state === 'ok' || state === 'failed') s.fetch_detail = null
    this.notify()
  }

  setFetchDetail(name: string, detail: string | null, itemCount?: number): void {
    const s = this.find(name)
    s.fetch_detail = detail
    if (itemCount !== undefined) s.item_count = itemCount
    this.notify()
  }

  /** Mark a sensor as loaded from cache (incremental run). Sets fetch to 'ok' with fetch_cached flag. */
  setCachedSensor(name: string, itemCount: number): void {
    const s = this.find(name)
    s.fetch = 'ok'
    s.fetch_cached = true
    s.item_count = itemCount
    this.notify()
  }

  setSummaryState(
    name: string,
    state: StageState,
    error?: string | null,
  ): void {
    const s = this.find(name)
    s.summary = state
    if (error !== undefined) s.summary_error = error
    this.notify()
  }

  /** Mark a sensor's summary as skipped (used for sensors that failed fetch). */
  skipSummaryForSensor(name: string): void {
    const s = this.find(name)
    s.summary = 'skipped'
    this.notify()
  }

  setSummaryChunks(name: string, total: number, done: number): void {
    const s = this.find(name)
    s.summary_chunks_total = total
    s.summary_chunks_done = done
    this.notify()
  }

  setVerifyProgress(name: string, attempt: number, maxRetries: number, failures: number): void {
    const s = this.find(name)
    s.verify_attempt = attempt
    s.verify_max_retries = maxRetries
    s.verify_failures = failures
    this.notify()
  }

  setOverallSummary(state: StageState): void {
    this.overallSummary = state
    this.notify()
  }

  /** Set auto-retry progress (e.g. attempt 2 of 3). */
  setRetryProgress(attempt: number, max: number): void {
    this.retryAttempt = attempt
    this.retryMax = max
    this.notify()
  }

  /** Clear retry progress (retries finished or skipped). */
  clearRetryProgress(): void {
    this.retryAttempt = 0
    this.retryMax = 0
    this.notify()
  }

  /** Enter paused state at a given stage. Pipeline remains running but awaits user action. */
  pause(stage: 'fetch' | 'summary' | 'pre_overall'): void {
    this.paused = true
    this.pausedStage = stage
    this.notify()
  }

  /** Exit paused state and resume normal execution. */
  unpause(): void {
    this.paused = false
    this.pausedStage = null
    this.notify()
  }

  /** Reset a sensor's fetch state to queued for re-fetch during pause. */
  resetFetchState(name: string): void {
    const s = this.find(name)
    s.fetch = 'queued'
    s.fetch_error = null
    s.fetch_error_kind = null
    s.fetch_detail = null
    s.fetch_started_at = null
    s.fetch_cached = false
    s.item_count = 0
    this.notify()
  }

  /** Reset a sensor's summary state to queued for re-summarization during pause. */
  resetSummaryState(name: string): void {
    const s = this.find(name)
    s.summary = 'queued'
    s.summary_error = null
    s.summary_chunks_total = 0
    s.summary_chunks_done = 0
    s.verify_attempt = 0
    s.verify_max_retries = 0
    s.verify_failures = 0
    this.notify()
  }

  /** Cancel the pipeline: mark incomplete stages as 'cancelled', stop running. */
  cancel(): void {
    this.running = false
    this.cancelled = true
    this.completedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    for (const s of this.sensors) {
      if (s.fetch === 'queued' || s.fetch === 'running') s.fetch = 'cancelled'
      if (s.summary === 'queued' || s.summary === 'running') s.summary = 'cancelled'
    }
    if (this.overallSummary === 'queued' || this.overallSummary === 'running') {
      this.overallSummary = 'cancelled'
    }
    this.notify()
  }

  complete(): void {
    this.running = false
    this.completedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    // Finalize any sensors still in non-terminal states.
    // Unlike cancel(), use 'skipped' — the pipeline completed normally,
    // these sensors were simply never started or never finished.
    for (const s of this.sensors) {
      if (s.fetch === 'queued' || s.fetch === 'running') s.fetch = 'skipped'
      if (s.summary === 'queued' || s.summary === 'running') s.summary = 'skipped'
    }
    if (this.overallSummary === 'queued' || this.overallSummary === 'running') {
      this.overallSummary = 'skipped'
    }
    this.notify()
  }

  snapshot(): PipelineStatus {
    return {
      running: this.running,
      cancelled: this.cancelled,
      paused: this.paused,
      paused_stage: this.pausedStage,
      retry_attempt: this.retryAttempt,
      retry_max: this.retryMax,
      mode: this.mode,
      run_id: this.runId,
      default_concurrency: this.defaultConcurrency,
      local_summary_concurrency: this.localSummaryConcurrency,
      started_at: this.startedAt,
      completed_at: this.completedAt,
      sensors: this.sensors.map(s => ({ ...s })),
      overall_summary: this.overallSummary,
      total_items: this.sensors
        .filter(s => s.fetch === 'ok')
        .reduce((sum, s) => sum + s.item_count, 0),
      events: [...this.events],
    }
  }
}
