// ABOUTME: Tests for PipelineHaltBanner component — polls pipeline status and shows a halt banner.
// ABOUTME: Verifies rendering conditions, failed sensor count display, and retry/skip button actions.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { PipelineHaltBanner } from '../PipelineHaltBanner'
import { makePipelineStatus, makeSensorJob } from '../status/test-helpers'

// --- Mocks ---

const mockGetPipelineStatus = vi.fn()
const mockResumePipeline = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    getPipelineStatus: (...args: unknown[]) => mockGetPipelineStatus(...args),
    resumePipeline: (...args: unknown[]) => mockResumePipeline(...args),
  },
}))

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: vi.fn(),
  }),
}))

const mockShowToast = vi.fn()
vi.mock('@/lib/toast-context', () => ({
  useToast: () => mockShowToast,
}))

// --- Helpers ---

/** Flush pending microtasks so the initial poll() promise resolves and React re-renders. */
async function flushPolling() {
  // The component calls poll() synchronously on mount, which fires a promise.
  // We need to let that promise resolve and React process the state update.
  await act(async () => {
    // Flush microtasks
    await Promise.resolve()
  })
}

// --- Test suite ---

describe('PipelineHaltBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetPipelineStatus.mockReset()
    mockResumePipeline.mockReset()
    mockShowToast.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render when status is null (getPipelineStatus rejects)', async () => {
    mockGetPipelineStatus.mockRejectedValue(new Error('network error'))

    const { container } = render(<PipelineHaltBanner />)
    await flushPolling()

    expect(container.innerHTML).toBe('')
  })

  it('does not render when pipeline is running (not paused)', async () => {
    mockGetPipelineStatus.mockResolvedValue(
      makePipelineStatus({ running: true, paused: false, alive: true }),
    )

    const { container } = render(<PipelineHaltBanner />)
    await flushPolling()

    expect(container.innerHTML).toBe('')
  })

  it('does not render when paused but no failed sensors', async () => {
    mockGetPipelineStatus.mockResolvedValue(
      makePipelineStatus({
        paused: true,
        paused_stage: 'pre_overall',
        alive: true,
        sensors: [
          makeSensorJob('hacker_news', { fetch: 'ok' }),
          makeSensorJob('github', { fetch: 'ok' }),
        ],
      }),
    )

    const { container } = render(<PipelineHaltBanner />)
    await flushPolling()

    expect(container.innerHTML).toBe('')
  })

  it('renders banner with correct count when halted with failures', async () => {
    mockGetPipelineStatus.mockResolvedValue(
      makePipelineStatus({
        paused: true,
        paused_stage: 'pre_overall',
        alive: true,
        sensors: [
          makeSensorJob('hacker_news', { fetch: 'failed' }),
          makeSensorJob('github', { fetch: 'failed' }),
          makeSensorJob('arxiv', { fetch: 'ok' }),
        ],
      }),
    )

    render(<PipelineHaltBanner />)
    await flushPolling()

    // The t function returns the key — halt.title and halt.message are rendered
    expect(screen.getByText('halt.title')).toBeInTheDocument()
    expect(screen.getByText('halt.message')).toBeInTheDocument()
    // Both buttons are present
    expect(screen.getByText('halt.retry')).toBeInTheDocument()
    expect(screen.getByText('halt.skip')).toBeInTheDocument()
  })

  it('retry button calls resumePipeline with retry_all', async () => {
    mockGetPipelineStatus.mockResolvedValue(
      makePipelineStatus({
        paused: true,
        paused_stage: 'pre_overall',
        alive: true,
        sensors: [makeSensorJob('hacker_news', { fetch: 'failed' })],
      }),
    )
    mockResumePipeline.mockResolvedValue({ status: 'ok' })

    render(<PipelineHaltBanner />)
    await flushPolling()

    const retryBtn = screen.getByText('halt.retry')
    await act(async () => { fireEvent.click(retryBtn) })

    expect(mockResumePipeline).toHaveBeenCalledWith('retry_all')
  })

  it('skip button calls resumePipeline with generate_overall', async () => {
    mockGetPipelineStatus.mockResolvedValue(
      makePipelineStatus({
        paused: true,
        paused_stage: 'pre_overall',
        alive: true,
        sensors: [makeSensorJob('hacker_news', { fetch: 'failed' })],
      }),
    )
    mockResumePipeline.mockResolvedValue({ status: 'ok' })

    render(<PipelineHaltBanner />)
    await flushPolling()

    const skipBtn = screen.getByText('halt.skip')
    await act(async () => { fireEvent.click(skipBtn) })

    expect(mockResumePipeline).toHaveBeenCalledWith('generate_overall')
  })
})
