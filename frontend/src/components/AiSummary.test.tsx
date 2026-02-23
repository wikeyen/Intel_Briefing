// ABOUTME: Tests for the AiSummary component — OpenRouterModelPicker integration.
// ABOUTME: Covers model fetching, filtering, selection, pricing display, error states, and cache bypass.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { I18nProvider } from '@/lib/i18n/context'

// Mock the toast context
vi.mock('@/lib/toast-context', () => ({
  useToast: () => vi.fn(),
}))

// Mock the API client — getConfig is used by AiSummary on mount
vi.mock('@/api/client', () => ({
  api: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    testSummary: vi.fn(),
  },
}))

// Mock the summary prompts module (imported by AiSummary)
vi.mock('@/lib/summary/prompts', () => ({
  DEFAULT_SENSOR_PROMPTS: {},
  DEFAULT_OVERALL_PROMPT: 'Default overall prompt text',
}))

import { api } from '@/api/client'

const mockGetConfig = api.getConfig as ReturnType<typeof vi.fn>

const MOCK_CONFIG = {
  summary_provider: 'openrouter' as const,
  summary_base_url: 'https://openrouter.ai/api/v1',
  summary_model: 'anthropic/claude-sonnet-4',
  summary_sensor_prompts: {},
  summary_overall_prompt: '',
  summary_language: 'zh' as const,
}

const MOCK_MODELS_RESPONSE = {
  data: [
    {
      id: 'anthropic/claude-sonnet-4',
      name: 'Anthropic: Claude Sonnet 4',
      pricing: { prompt: '0.000003', completion: '0.000015' },
      context_length: 200000,
    },
    {
      id: 'openai/gpt-4o',
      name: 'OpenAI: GPT-4o',
      pricing: { prompt: '0.0000025', completion: '0.00001' },
      context_length: 128000,
    },
    {
      id: 'google/gemini-2.5-pro',
      name: 'Google: Gemini 2.5 Pro',
      pricing: { prompt: '0.000001', completion: '0.000004' },
      context_length: 1000000,
    },
  ],
}

function createFetchSpy(modelsResponse = MOCK_MODELS_RESPONSE, shouldReject = false) {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    if (urlStr.includes('openrouter.ai/api/v1/models')) {
      if (shouldReject) {
        throw new Error('Network error')
      }
      return new Response(JSON.stringify(modelsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Fallback for any unexpected fetch calls
    return new Response(JSON.stringify({}), { status: 200 })
  })
}

describe('AiSummary — OpenRouterModelPicker', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue({ ...MOCK_CONFIG })
    fetchSpy = createFetchSpy()
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('fetches and displays available model count', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      // Both generation and attribution pickers show model counts
      const badges = screen.getAllByText('3 models available')
      expect(badges.length).toBeGreaterThanOrEqual(1)
      expect(badges[0]).toBeInTheDocument()
    })
  })

  it('shows the currently selected model in the input', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    // Generation model picker is the first one in the DOM
    const inputs = screen.getAllByPlaceholderText('Type to search models…')
    expect(inputs[0]).toHaveValue('anthropic/claude-sonnet-4')
  })

  it('filters models when typing a search term', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    // Generation model picker is the first one in the DOM
    const inputs = screen.getAllByPlaceholderText('Type to search models…')
    const input = inputs[0]
    // Focus opens the dropdown and clears search
    fireEvent.focus(input)
    // Type a search term
    fireEvent.change(input, { target: { value: 'gemini' } })
    // Only the Gemini model should be visible in the generation picker dropdown
    expect(screen.getByText('google/gemini-2.5-pro')).toBeInTheDocument()
    expect(screen.queryByText('anthropic/claude-sonnet-4')).not.toBeInTheDocument()
    expect(screen.queryByText('openai/gpt-4o')).not.toBeInTheDocument()
  })

  it('shows pricing and context length in dropdown rows', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    const inputs = screen.getAllByPlaceholderText('Type to search models…')
    fireEvent.focus(inputs[0])
    // Claude Sonnet 4: prompt=0.000003*1M=3 => "$3.0", completion=0.000015*1M=15 => "$15"
    // formatContext(200000) => "200K"
    expect(screen.getByText('$3.0 / $15 · 200K')).toBeInTheDocument()
    // GPT-4o: prompt=0.0000025*1M=2.5 => "$2.5", completion=0.00001*1M=10 => "$10"
    expect(screen.getByText('$2.5 / $10 · 128K')).toBeInTheDocument()
    // Gemini 2.5 Pro: prompt=0.000001*1M=1 => "$1.0", completion=0.000004*1M=4 => "$4.0"
    expect(screen.getByText('$1.0 / $4.0 · 1M')).toBeInTheDocument()
  })

  it('selects a model when clicking a dropdown row', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    const inputs = screen.getAllByPlaceholderText('Type to search models…')
    const input = inputs[0]
    fireEvent.focus(input)
    // Click on GPT-4o row
    const gptRow = screen.getByText('openai/gpt-4o')
    fireEvent.mouseDown(gptRow)
    // After selection, input should show the new model
    expect(input).toHaveValue('openai/gpt-4o')
  })

  it('shows error state when fetch fails', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    // Replace fetch with a failing one and click Refresh (bypasses cache)
    const failingSpy = createFetchSpy(MOCK_MODELS_RESPONSE, true)
    vi.stubGlobal('fetch', failingSpy)
    // Click the first Refresh button (generation model picker)
    const refreshBtns = screen.getAllByText('Refresh')
    fireEvent.click(refreshBtns[0])
    await waitFor(() => {
      expect(screen.getByText('Cannot reach OpenRouter')).toBeInTheDocument()
    })
  })

  it('refetches models when Refresh button is clicked', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    const initialCallCount = fetchSpy.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('openrouter.ai'),
    ).length
    // Click the first Refresh button (generation model picker)
    const refreshBtns = screen.getAllByText('Refresh')
    fireEvent.click(refreshBtns[0])
    await waitFor(() => {
      const newCallCount = fetchSpy.mock.calls.filter(
        (c: unknown[]) => String(c[0]).includes('openrouter.ai'),
      ).length
      expect(newCallCount).toBeGreaterThan(initialCallCount)
    })
  })

  it('shows "no models matching" when search yields no results', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    const inputs = screen.getAllByPlaceholderText('Type to search models…')
    fireEvent.focus(inputs[0])
    fireEvent.change(inputs[0], { target: { value: 'nonexistent-xyz' } })
    expect(screen.getByText('No models matching "nonexistent-xyz"')).toBeInTheDocument()
  })

  it('displays free pricing for zero-cost models', async () => {
    render(await renderAiSummary())
    await waitFor(() => {
      expect(screen.getAllByText('3 models available').length).toBeGreaterThanOrEqual(1)
    })
    // Replace fetch with free models data and click Refresh to bypass cache
    const freeModels = {
      data: [
        {
          id: 'meta/llama-3-free',
          name: 'Meta: Llama 3 Free',
          pricing: { prompt: '0', completion: '0' },
          context_length: 8000,
        },
      ],
    }
    const freeSpy = createFetchSpy(freeModels)
    vi.stubGlobal('fetch', freeSpy)
    // Click the first Refresh button (generation model picker)
    const refreshBtns = screen.getAllByText('Refresh')
    fireEvent.click(refreshBtns[0])
    await waitFor(() => {
      expect(screen.getByText('1 model available')).toBeInTheDocument()
    })
    // Open dropdown on the generation model picker
    const inputs = screen.getAllByPlaceholderText('Type to search models…')
    fireEvent.focus(inputs[0])
    expect(screen.getByText('free / free · 8K')).toBeInTheDocument()
  })
})

/** Helper: dynamically import and render AiSummary to avoid stale module references. */
async function renderAiSummary() {
  const { AiSummary } = await import('./AiSummary')
  return <I18nProvider initialLocale="en"><AiSummary /></I18nProvider>
}
