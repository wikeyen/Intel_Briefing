// ABOUTME: Pipeline progress tracker — manages two-stage pipeline state via observer pattern.
// ABOUTME: Decouples state transitions from persistence; callers subscribe via onChange callback.
import type { PipelineStatus, SensorJobProgress, StageState, RunMode } from '../models'

type OnChangeCallback = (status: PipelineStatus) => void

/**
 * Manages pipeline execution state for all sensors across fetch and summary stages.
 * State changes are broadcast to an onChange listener (typically SQLite persistence).
 */
export class PipelineProgressTracker {
  private readonly sensors: SensorJobProgress[]
  private readonly mode: RunMode
  private readonly fetchConcurrency: number
  private readonly summaryConcurrency: number
  private readonly onChange?: OnChangeCallback
  private readonly startedAt: string
  private completedAt: string | null = null
  private running = true
  private cancelled = false
  private overallSummary: StageState

  constructor(
    sensorNames: string[],
    mode: RunMode,
    fetchConcurrency: number,
    summaryConcurrency: number,
    onChange?: OnChangeCallback,
  ) {
    this.mode = mode
    this.fetchConcurrency = fetchConcurrency
    this.summaryConcurrency = summaryConcurrency
    this.onChange = onChange
    this.startedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

    const skipFetch = mode === 'summarize'
    const skipSummary = mode === 'fetch'

    this.sensors = sensorNames.map(name => ({
      name,
      fetch: skipFetch ? 'skipped' : 'queued',
      fetch_error: null,
      fetch_error_kind: null,
      summary: skipSummary ? 'skipped' : 'queued',
      summary_error: null,
      item_count: 0,
      summary_chunks_total: 0,
      summary_chunks_done: 0,
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

  setFetchState(
    name: string,
    state: StageState,
    itemCount?: number,
    error?: string | null,
    errorKind?: 'config' | 'api' | null,
  ): void {
    const s = this.find(name)
    s.fetch = state
    if (itemCount !== undefined) s.item_count = itemCount
    if (error !== undefined) s.fetch_error = error
    if (errorKind !== undefined) s.fetch_error_kind = errorKind
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

  setOverallSummary(state: StageState): void {
    this.overallSummary = state
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
    this.notify()
  }

  snapshot(): PipelineStatus {
    return {
      running: this.running,
      cancelled: this.cancelled,
      mode: this.mode,
      fetch_concurrency: this.fetchConcurrency,
      summary_concurrency: this.summaryConcurrency,
      started_at: this.startedAt,
      completed_at: this.completedAt,
      sensors: this.sensors.map(s => ({ ...s })),
      overall_summary: this.overallSummary,
      total_items: this.sensors
        .filter(s => s.fetch === 'ok')
        .reduce((sum, s) => sum + s.item_count, 0),
    }
  }
}
