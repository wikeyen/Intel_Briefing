# OpenRouter Model Picker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plain text input for the OpenRouter model field with a searchable dropdown that fetches models from OpenRouter's API, showing pricing and context length.

**Architecture:** New `OpenRouterModelPicker` component in `AiSummary.tsx` that mirrors the existing `OllamaModelPicker` pattern. Fetches directly from `https://openrouter.ai/api/v1/models` (no auth needed). No backend changes.

**Tech Stack:** React, TypeScript, inline CSS (matching existing component style)

---

### Task 1: Create the OpenRouterModel type and price formatting helper

**Files:**
- Modify: `frontend/src/components/AiSummary.tsx` (add after the `OllamaModelPicker` component, around line 264)

**Step 1: Add the type and helper above the `/* ─── Prompt Customization */` section**

```tsx
/* ─── OpenRouter Model Picker ─────────────────────────────────────── */

interface OpenRouterModel {
  id: string
  name: string
  promptPrice: number   // cost per 1M input tokens
  completionPrice: number // cost per 1M output tokens
  contextLength: number
}

/** Format a raw per-token price string into a per-million-token display. */
function formatPrice(perToken: string | number): string {
  const n = Number(perToken) * 1_000_000
  if (n === 0) return 'free'
  if (n < 0.01) return '<$0.01'
  if (n < 1) return `$${n.toFixed(2)}`
  if (n < 10) return `$${n.toFixed(1)}`
  return `$${Math.round(n)}`
}

/** Format context length as e.g. "200K" or "1M". */
function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(tokens / 1000)}K`
}
```

**Step 2: Verify the file still has no syntax errors**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in AiSummary.tsx

---

### Task 2: Build the OpenRouterModelPicker component

**Files:**
- Modify: `frontend/src/components/AiSummary.tsx` (add after the helpers from Task 1, before the `/* ─── Prompt Customization */` section)

**Step 1: Add the component**

```tsx
function OpenRouterModelPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const parsed: OpenRouterModel[] = (data.data ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: (m.name as string) ?? (m.id as string),
        promptPrice: Number((m.pricing as Record<string, string>)?.prompt ?? 0) * 1_000_000,
        completionPrice: Number((m.pricing as Record<string, string>)?.completion ?? 0) * 1_000_000,
        contextLength: (m.context_length as number) ?? 0,
      }))
      setModels(parsed)
      if (parsed.length === 0) setError('No models returned')
    } catch {
      setError('Cannot reach OpenRouter')
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const lowerSearch = search.toLowerCase()
  const filtered = models.filter((m) =>
    m.id.toLowerCase().includes(lowerSearch) || m.name.toLowerCase().includes(lowerSearch),
  )

  const statusLine = loading
    ? 'Loading models…'
    : error
      ? error
      : `${models.length} model${models.length !== 1 ? 's' : ''} available`

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Combobox input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={open ? search : value}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={(e) => {
            setOpen(true)
            setSearch('')
            focus(e)
          }}
          onBlur={blur}
          placeholder="Type to search models…"
          style={{ ...inputBase, width: '100%', paddingRight: '2.25rem' }}
        />
        <span style={{
          position: 'absolute',
          right: '0.875rem',
          top: '50%',
          transform: `translateY(-50%) rotate(${open ? '180deg' : '0deg'})`,
          pointerEvents: 'none',
          color: 'var(--ink-faint)',
          fontSize: '0.625rem',
          transition: 'transform 150ms',
          userSelect: 'none',
        }}>
          ▾
        </span>
      </div>

      {/* Status line */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '0.375rem',
      }}>
        <span style={{ fontSize: '0.75rem', color: error ? 'var(--warn)' : 'var(--ink-faint)' }}>
          {statusLine}
        </span>
        <button
          onClick={(e) => { e.preventDefault(); fetchModels() }}
          disabled={loading}
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: loading ? 'var(--ink-faint)' : 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Dropdown list */}
      {open && !loading && (
        <div style={{
          position: 'absolute',
          top: 'calc(2.75rem + 2px)',
          left: 0,
          right: 0,
          maxHeight: 260,
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
          zIndex: 50,
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '0.875rem 1rem', color: 'var(--ink-faint)', fontSize: '0.8125rem' }}>
              {search ? `No models matching "${search}"` : 'No models available'}
            </div>
          )}
          {filtered.map((m, idx) => {
            const selected = m.id === value
            return (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(m.id)
                  setOpen(false)
                  setSearch('')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  width: '100%',
                  padding: '0.625rem 1rem',
                  background: selected ? 'var(--accent-wash)' : 'transparent',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--ink)',
                  transition: 'background 60ms',
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = 'var(--surface-alt)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected ? 'var(--accent-wash)' : 'transparent'
                }}
              >
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: selected ? 600 : 400,
                  color: selected ? 'var(--accent)' : 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {m.id}
                </span>
                <span style={{
                  fontSize: '0.6875rem',
                  color: 'var(--ink-faint)',
                  fontFamily: 'ui-monospace, monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {formatPrice(m.promptPrice / 1_000_000)} / {formatPrice(m.completionPrice / 1_000_000)}
                  {m.contextLength > 0 ? ` · ${formatContext(m.contextLength)}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify the file still has no syntax errors**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in AiSummary.tsx

---

### Task 3: Wire the picker into the AiSummary form

**Files:**
- Modify: `frontend/src/components/AiSummary.tsx` (lines 453-477, the Model field section)

**Step 1: Replace the plain `<input>` else-branch with the new picker**

Find this block (approx lines 453-477):
```tsx
              <div>
                <FieldLabel>Model</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={summaryModel}
                    onChange={setSummaryModel}
                    baseUrl={summaryBaseUrl}
                  />
                ) : (
                  <input
                    type="text"
                    value={summaryModel}
                    disabled={!isEnabled}
                    onChange={(e) => setSummaryModel(e.target.value)}
                    placeholder="anthropic/claude-sonnet-4"
                    style={{
                      ...inputBase,
                      width: '100%',
                      opacity: !isEnabled ? 0.5 : 1,
                      cursor: !isEnabled ? 'not-allowed' : 'text',
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                )}
              </div>
```

Replace with:
```tsx
              <div>
                <FieldLabel>Model</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={summaryModel}
                    onChange={setSummaryModel}
                    baseUrl={summaryBaseUrl}
                  />
                ) : isEnabled ? (
                  <OpenRouterModelPicker
                    value={summaryModel}
                    onChange={setSummaryModel}
                  />
                ) : (
                  <input
                    type="text"
                    value={summaryModel}
                    disabled
                    placeholder="anthropic/claude-sonnet-4"
                    style={{
                      ...inputBase,
                      width: '100%',
                      opacity: 0.5,
                      cursor: 'not-allowed',
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                )}
              </div>
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: Clean compilation

---

### Task 4: Write tests for the OpenRouterModelPicker

**Files:**
- Create: `frontend/src/components/AiSummary.test.tsx`

**Step 1: Write the test file**

```tsx
// ABOUTME: Tests for the OpenRouter model picker in AiSummary.
// ABOUTME: Covers model fetching, search filtering, selection, error states, and refresh.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the API client before importing the component
vi.mock('@/api/client', () => ({
  api: {
    getConfig: vi.fn().mockResolvedValue({
      summary_provider: 'openrouter',
      summary_api_key: '',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'anthropic/claude-sonnet-4',
      summary_sensor_prompts: {},
      summary_overall_prompt: '',
    }),
    updateConfig: vi.fn().mockResolvedValue({}),
    testSummary: vi.fn().mockResolvedValue({ ok: true, latency_ms: 100 }),
  },
}))

// Mock toast context
vi.mock('@/lib/toast-context', () => ({
  useToast: () => vi.fn(),
}))

import { AiSummary } from './AiSummary'

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

describe('AiSummary — OpenRouter Model Picker', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    // Default: OpenRouter models endpoint returns mock data
    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('openrouter.ai/api/v1/models')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_MODELS_RESPONSE),
        })
      }
      // Fallback for other fetches (api client calls through /api)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and displays available model count', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })
  })

  it('shows the currently selected model in the input', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Type to search models…')
      expect(input).toHaveValue('anthropic/claude-sonnet-4')
    })
  })

  it('filters models when typing a search term', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Type to search models…')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'gemini' } })

    // Should show only the Gemini model
    expect(screen.getByText('google/gemini-2.5-pro')).toBeInTheDocument()
    expect(screen.queryByText('anthropic/claude-sonnet-4')).not.toBeInTheDocument()
    expect(screen.queryByText('openai/gpt-4o')).not.toBeInTheDocument()
  })

  it('shows pricing and context length in dropdown rows', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Type to search models…')
    fireEvent.focus(input)

    // Check for context length display (200K for Claude)
    expect(screen.getByText(/200K/)).toBeInTheDocument()
    // Check for 1M context (Gemini)
    expect(screen.getByText(/1M/)).toBeInTheDocument()
  })

  it('selects a model when clicking a dropdown row', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Type to search models…')
    fireEvent.focus(input)

    // Click on GPT-4o
    fireEvent.mouseDown(screen.getByText('openai/gpt-4o'))

    // Input should now show the selected model
    await waitFor(() => {
      expect(input).toHaveValue('openai/gpt-4o')
    })
  })

  it('shows error state when fetch fails', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('openrouter.ai/api/v1/models')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    })

    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('Cannot reach OpenRouter')).toBeInTheDocument()
    })
  })

  it('refetches models when Refresh button is clicked', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })

    const openRouterCalls = () =>
      fetchSpy.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('openrouter.ai/api/v1/models'),
      ).length

    const before = openRouterCalls()
    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(openRouterCalls()).toBe(before + 1)
    })
  })

  it('shows "no models matching" when search yields no results', async () => {
    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Type to search models…')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'nonexistent-model-xyz' } })

    expect(screen.getByText('No models matching "nonexistent-model-xyz"')).toBeInTheDocument()
  })
})
```

**Step 2: Run the tests**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx vitest run src/components/AiSummary.test.tsx`
Expected: All 7 tests pass

---

### Task 5: Test formatting helpers

**Files:**
- Modify: `frontend/src/components/AiSummary.test.tsx` (add to end of file)

**Step 1: Add unit tests for `formatPrice` and `formatContext`**

Since these are private functions inside the component file, we test them indirectly through the rendered output. The pricing/context tests in Task 4 already cover this. However, we should verify edge cases through the dropdown display:

Add this test to the existing describe block:

```tsx
  it('displays free pricing for zero-cost models', async () => {
    const freeModels = {
      data: [
        {
          id: 'meta/llama-3-8b',
          name: 'Meta: Llama 3 8B',
          pricing: { prompt: '0', completion: '0' },
          context_length: 8192,
        },
      ],
    }
    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('openrouter.ai/api/v1/models')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(freeModels),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<AiSummary />)
    await waitFor(() => {
      expect(screen.getByText('1 model available')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Type to search models…')
    fireEvent.focus(input)

    expect(screen.getByText(/free/)).toBeInTheDocument()
    expect(screen.getByText(/8K/)).toBeInTheDocument()
  })
```

**Step 2: Run all tests**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx vitest run src/components/AiSummary.test.tsx`
Expected: All 8 tests pass

---

### Task 6: Run full test suite and verify no regressions

**Step 1: Run all frontend tests**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx vitest run`
Expected: All tests pass (existing ~127 + 8 new)

**Step 2: Run TypeScript compilation check**

Run: `cd /Users/mikeyan/Developer/Info_Aggregation/frontend && npx tsc --noEmit`
Expected: Clean — no type errors

---

### Task 7: Commit

**Step 1: Stage and commit**

```bash
cd /Users/mikeyan/Developer/Info_Aggregation
git add frontend/src/components/AiSummary.tsx frontend/src/components/AiSummary.test.tsx
git commit -m "feat(ai): add searchable OpenRouter model picker with pricing and context info"
```
