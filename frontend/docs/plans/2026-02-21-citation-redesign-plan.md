# Post-hoc Citation Attribution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace unreliable in-generation `[N]` citation markers with a post-hoc attribution system that matches claims to sources in a dedicated LLM pass.

**Architecture:** Generate clean analysis text without citations, then run parallel attribution LLM calls to insert `[N]` markers. Section entries use a cheap model (small source pool per sensor), while exec summary and sentiment use the strong model (full source pool). All attribution calls run in parallel.

**Tech Stack:** TypeScript, Next.js 15, OpenAI-compatible LLM API via OpenRouter/Ollama

---

### Task 1: Add `summary_attribution_model` to config types

**Files:**
- Modify: `src/lib/models.ts:318` (ConfigSettings interface)
- Modify: `src/lib/models.ts:380` (defaultConfig function)
- Modify: `src/api/client.ts:46` (ConfigSettings interface)

**Step 1: Add `summary_attribution_model` to ConfigSettings in `src/lib/models.ts`**

After line 318 (`summary_model: string`), add:

```typescript
  summary_attribution_model: string
```

In `defaultConfig()` (after line 380, `summary_model`), add:

```typescript
    summary_attribution_model: '',
```

**Step 2: Add `summary_attribution_model` to ConfigSettings in `src/api/client.ts`**

After line 46 (`summary_model: string`), add:

```typescript
  summary_attribution_model: string
```

**Step 3: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (empty string is a valid default — falls back to summary_model in usage)

**Step 4: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All 469 tests pass

**Step 5: Commit**

```bash
git add src/lib/models.ts src/api/client.ts
git commit -m "feat: add summary_attribution_model to config types"
```

---

### Task 2: Add attribution model picker to Settings UI

**Files:**
- Modify: `src/components/AiSummary.tsx`

**Step 1: Add state and auto-save wiring for attribution model**

After the `summaryModel` state declaration (line 58), add:

```typescript
const [attributionModel, setAttributionModel] = useState('')
```

In the `useAutoSave` callback (line 74, inside the object), add:

```typescript
      summary_attribution_model: attributionModel,
```

In the `useEffect` that loads config (around line 86), add:

```typescript
      setAttributionModel(cfg.summary_attribution_model || '')
```

In `handleProviderChange`, after `setSummaryModel(...)` for each provider branch, add:

```typescript
      setAttributionModel('')
```

**Step 2: Add the Attribution Model picker UI**

After the Model picker `</div>` (end of the second grid column, around line 227), but INSIDE the `settings-grid-2col` grid div, add a full-width row spanning both columns:

Actually, place it after the entire 2-column grid div (after line 228). Add a new field:

```tsx
            {/* Attribution Model — only shown when provider is enabled */}
            {isEnabled && (
              <div>
                <FieldLabel>Attribution Model</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                    baseUrl={summaryBaseUrl}
                  />
                ) : (
                  <OpenRouterModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                  />
                )}
                <HelpText>
                  Cheaper model for per-section citation matching. Falls back to generation model if unset.
                </HelpText>
              </div>
            )}
```

**Step 3: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/AiSummary.tsx
git commit -m "feat: add attribution model picker to AI summary settings"
```

---

### Task 3: Wire attribution model into orchestrator's LLM config

**Files:**
- Modify: `src/lib/summary/llm.ts` (LlmConfig type — no changes needed, already has `model` field)
- Modify: `src/lib/pipeline/orchestrator.ts:76-82` (buildLlmConfig)
- Modify: `src/lib/summary/summarizer.ts` (SummarizeOptions)
- Modify: `src/lib/config/index.ts:81` (env overlay)

**Step 1: Add attribution model to SummarizeOptions**

In `src/lib/summary/summarizer.ts`, after the `onToken` field in the `SummarizeOptions` interface (around line 48), add:

```typescript
  /** LLM config override for attribution calls (cheap model). Falls back to main llmConfig. */
  attributionLlmConfig?: LlmConfig
```

**Step 2: Pass attribution config from orchestrator**

In `src/lib/pipeline/orchestrator.ts`, modify `buildLlmConfig` to also build an attribution config. After line 82, add a new function:

```typescript
function buildAttributionLlmConfig(config: ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  if (!config.summary_attribution_model) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_attribution_model,
  }
}
```

Find where `summarizeReport` is called (around line 290) and add `attributionLlmConfig` to the options:

```typescript
attributionLlmConfig: buildAttributionLlmConfig(config) ?? undefined,
```

**Step 3: Add env overlay for attribution model**

In `src/lib/config/index.ts`, after line 81 (`summary_model`), add:

```typescript
    summary_attribution_model: env.SUMMARY_ATTRIBUTION_MODEL || config.summary_attribution_model,
```

**Step 4: Run type check and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: Type check clean, all tests pass

**Step 5: Commit**

```bash
git add src/lib/summary/summarizer.ts src/lib/pipeline/orchestrator.ts src/lib/config/index.ts
git commit -m "feat: wire attribution model config through pipeline"
```

---

### Task 4: Remove citation instructions from prompts

**Files:**
- Modify: `src/lib/summary/prompts.ts:101-162` (DEFAULT_OVERALL_PROMPT)

**Step 1: Remove citation-related instructions from overall prompt**

In `DEFAULT_OVERALL_PROMPT`, make these changes:

1. Remove line 107: `4. 使用 [N] 标记引用来源（N 是参考清单中的编号）`

2. In the JSON format template, change line 116 from:
   ```
   { "text": "条目内容，用[N]标记引用来源", "source": "来源名称" }
   ```
   to:
   ```
   { "text": "条目内容", "source": "来源名称" }
   ```

3. In the sentiment section, remove `，用[N]标记引用来源` from lines 124, 127, 130 (controversies, opinion_shifts, risk_flags analysis fields).

4. Remove the entire 引用规则 block (lines 135-140):
   ```
   引用规则：
   - 输入中包含一个编号参考清单（[1] 到 [N]），每条对应一个原始来源
   - 在 text 和 analysis 字段中，用 [N] 标记引用对应来源。标记紧跟在它所支持的事实之后
   - 只使用参考清单中存在的编号，严禁编造不存在的编号
   - 一条 entry 只讨论一个话题；如果想覆盖多个话题，拆成多条 entry
   - 不要在 JSON 中包含 refs 数组——引用完全通过 [N] 行内标记实现
   ```

5. In 板块说明, change line 143 from:
   ```
   - 综合分析（executive_summary）：跨领域的趋势分析和投资启示。可以进行综合性分析，不强制引用。
   ```
   to:
   ```
   - 综合分析（executive_summary）：跨领域的趋势分析和投资启示。
   ```

**Keep** the `## 参考清单` in the context — the LLM still needs to see the sources to write good analysis, it just doesn't need to cite them inline anymore.

**Step 2: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (prompt changes don't break parsing)

**Step 3: Commit**

```bash
git add src/lib/summary/prompts.ts
git commit -m "feat: remove inline citation instructions from overall prompt"
```

---

### Task 5: Create the attribution module

**Files:**
- Create: `src/lib/summary/attribution.ts`
- Create: `src/lib/summary/attribution.test.ts`

**Step 1: Write the attribution tests**

Create `src/lib/summary/attribution.test.ts`:

```typescript
// ABOUTME: Tests for post-hoc citation attribution — prompt building, result parsing, marker validation.
// ABOUTME: Verifies that attribution correctly inserts [N] markers and strips invalid ones.
import { describe, it, expect } from 'vitest'
import {
  buildSectionAttributionPrompt,
  buildExecSummaryAttributionPrompt,
  buildSentimentAttributionPrompt,
  parseSectionAttributionResult,
  parseTextAttributionResult,
  parseSentimentAttributionResult,
  stripInvalidMarkers,
} from './attribution'
import type { BriefingSource } from '../models'

const SOURCES: BriefingSource[] = [
  { id: 1, title: 'OpenAI GPT-5', url: 'https://example.com/1', sensor: 'hacker_news', brief: 'GPT-5 launch' },
  { id: 2, title: 'EU AI Act', url: 'https://example.com/2', sensor: 'wallstreetcn', brief: 'Regulation update' },
  { id: 3, title: 'Meta Llama 4', url: 'https://example.com/3', sensor: 'github', brief: 'Open source model' },
]

describe('buildSectionAttributionPrompt', () => {
  it('builds a prompt with entries and scoped sources', () => {
    const entries = [
      { text: 'OpenAI released GPT-5', source: 'Hacker News' },
    ]
    const prompt = buildSectionAttributionPrompt(entries, [SOURCES[0]])
    expect(prompt).toContain('OpenAI released GPT-5')
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('OpenAI GPT-5')
    expect(prompt).not.toContain('[2]')
  })
})

describe('buildExecSummaryAttributionPrompt', () => {
  it('builds a prompt with full text and all sources', () => {
    const text = 'AI regulation is accelerating.'
    const prompt = buildExecSummaryAttributionPrompt(text, SOURCES)
    expect(prompt).toContain('AI regulation is accelerating.')
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
    expect(prompt).toContain('[3]')
  })
})

describe('parseSectionAttributionResult', () => {
  it('parses JSON array of attributed texts', () => {
    const raw = '["OpenAI released GPT-5[1]", "EU passes AI Act[2]"]'
    const result = parseSectionAttributionResult(raw, 2)
    expect(result).toEqual(['OpenAI released GPT-5[1]', 'EU passes AI Act[2]'])
  })

  it('falls back to original count when array length mismatches', () => {
    const raw = '["Only one entry[1]"]'
    const result = parseSectionAttributionResult(raw, 3)
    expect(result).toBeNull()
  })

  it('handles markdown code fences', () => {
    const raw = '```json\n["text[1]"]\n```'
    const result = parseSectionAttributionResult(raw, 1)
    expect(result).toEqual(['text[1]'])
  })
})

describe('parseTextAttributionResult', () => {
  it('extracts text from JSON object with attributed_text field', () => {
    const raw = '{"attributed_text": "Analysis with[1] citations[2]"}'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('Analysis with[1] citations[2]')
  })

  it('falls back to raw text when not valid JSON', () => {
    const raw = 'Just plain text with[1] markers'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('Just plain text with[1] markers')
  })
})

describe('stripInvalidMarkers', () => {
  it('keeps valid markers', () => {
    const result = stripInvalidMarkers('text[1] more[2]', new Set([1, 2, 3]))
    expect(result).toBe('text[1] more[2]')
  })

  it('strips markers with IDs not in the valid set', () => {
    const result = stripInvalidMarkers('text[1] hallucinated[99]', new Set([1, 2]))
    expect(result).toBe('text[1] hallucinated')
  })

  it('handles no markers', () => {
    const result = stripInvalidMarkers('plain text', new Set([1]))
    expect(result).toBe('plain text')
  })
})

describe('parseSentimentAttributionResult', () => {
  it('parses JSON object with attributed arrays', () => {
    const raw = JSON.stringify({
      controversies: ['topic A[1]'],
      opinion_shifts: ['shift B[2]'],
      risk_flags: ['risk C[3]'],
    })
    const result = parseSentimentAttributionResult(raw)
    expect(result).toEqual({
      controversies: ['topic A[1]'],
      opinion_shifts: ['shift B[2]'],
      risk_flags: ['risk C[3]'],
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/summary/attribution.test.ts`
Expected: FAIL — module `./attribution` does not exist

**Step 3: Write the attribution module**

Create `src/lib/summary/attribution.ts`:

```typescript
// ABOUTME: Post-hoc citation attribution — builds prompts, parses results, validates markers.
// ABOUTME: Inserts [N] markers into clean text by matching claims to numbered source items.

import type { BriefingSource, BriefingEntry, SentimentEntry } from '../models'

const ATTRIBUTION_SYSTEM_PROMPT = `你是引用标注助手。你的任务是在文本的事实性声明后插入 [N] 标记，将声明与来源对应。

规则：
- 在事实性声明后紧跟 [N] 标记
- 一个声明可以引用多个来源：[1][3]
- 不要修改原文的任何其他内容，只插入标记
- 只使用候选来源中列出的编号，严禁编造不存在的编号
- 如果某句话不对应任何候选来源，不加标记
- 纯观点性或分析性的句子无需标注`

function formatSourceList(sources: BriefingSource[]): string {
  return sources
    .map(s => `[${s.id}] "${s.title}" — ${s.sensor}${s.brief ? ` — ${s.brief}` : ''}`)
    .join('\n')
}

/**
 * Build the user message for section entry attribution.
 * Entries are numbered 1..N; LLM returns a JSON array of the same length.
 */
export function buildSectionAttributionPrompt(
  entries: Pick<BriefingEntry, 'text' | 'source'>[],
  sources: BriefingSource[],
): string {
  const entriesText = entries
    .map((e, i) => `${i + 1}. "${e.text}"`)
    .join('\n')

  return `候选来源：
${formatSourceList(sources)}

条目：
${entriesText}

请为每个条目插入 [N] 标记后，以JSON数组返回（与输入顺序一致）。
示例输出：["条目一内容[1]，更多事实[2]", "条目二内容[3]"]`
}

/**
 * Build the user message for executive summary attribution.
 * LLM returns a JSON object with `attributed_text` field.
 */
export function buildExecSummaryAttributionPrompt(
  text: string,
  sources: BriefingSource[],
): string {
  return `候选来源：
${formatSourceList(sources)}

综合分析原文：
${text}

请在事实性声明后插入 [N] 标记，返回JSON：{"attributed_text": "标注后的完整文本"}`
}

/**
 * Build the user message for sentiment attribution.
 * LLM returns a JSON object with arrays for each sentiment category.
 */
export function buildSentimentAttributionPrompt(
  controversies: SentimentEntry[],
  opinionShifts: SentimentEntry[],
  riskFlags: SentimentEntry[],
  sources: BriefingSource[],
): string {
  const formatEntries = (entries: SentimentEntry[], label: string): string => {
    if (entries.length === 0) return `${label}：（无）`
    return `${label}：\n` + entries.map((e, i) => `${i + 1}. [${e.topic}] ${e.analysis}`).join('\n')
  }

  return `候选来源：
${formatSourceList(sources)}

${formatEntries(controversies, '争议')}

${formatEntries(opinionShifts, '舆论转向')}

${formatEntries(riskFlags, '风险信号')}

请为每个条目的 analysis 部分插入 [N] 标记后，以JSON返回：
{"controversies": ["标注后的分析1", ...], "opinion_shifts": ["标注后的分析1", ...], "risk_flags": ["标注后的分析1", ...]}`
}

/** System prompt for attribution calls. */
export { ATTRIBUTION_SYSTEM_PROMPT }

// ─── Result Parsers ──────────────────────────────────────────────

/** Strip markdown code fences from LLM output. */
function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
}

/**
 * Parse the section attribution result — expects a JSON array of strings.
 * Returns null if the array length doesn't match the expected count.
 */
export function parseSectionAttributionResult(
  raw: string,
  expectedCount: number,
): string[] | null {
  try {
    const cleaned = stripFences(raw)
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return null
    if (parsed.length !== expectedCount) return null
    return parsed.map(String)
  } catch {
    return null
  }
}

/**
 * Parse the exec summary attribution result — expects {"attributed_text": "..."}.
 * Falls back to raw text if JSON parsing fails (the LLM might return plain text).
 */
export function parseTextAttributionResult(raw: string): string {
  try {
    const cleaned = stripFences(raw)
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.attributed_text === 'string') return parsed.attributed_text
    // Fallback: if it's a plain string, use as-is
    if (typeof parsed === 'string') return parsed
    return cleaned
  } catch {
    return stripFences(raw)
  }
}

/**
 * Parse the sentiment attribution result.
 */
export function parseSentimentAttributionResult(
  raw: string,
): { controversies: string[]; opinion_shifts: string[]; risk_flags: string[] } | null {
  try {
    const cleaned = stripFences(raw)
    const parsed = JSON.parse(cleaned)
    return {
      controversies: Array.isArray(parsed.controversies) ? parsed.controversies.map(String) : [],
      opinion_shifts: Array.isArray(parsed.opinion_shifts) ? parsed.opinion_shifts.map(String) : [],
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map(String) : [],
    }
  } catch {
    return null
  }
}

/**
 * Strip [N] markers from text where N is not in the valid set of source IDs.
 * Prevents hallucinated citation numbers from reaching the UI.
 */
export function stripInvalidMarkers(text: string, validIds: Set<number>): string {
  return text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = parseInt(numStr, 10)
    return validIds.has(num) ? match : ''
  })
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/summary/attribution.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/summary/attribution.ts src/lib/summary/attribution.test.ts
git commit -m "feat: add post-hoc citation attribution module with tests"
```

---

### Task 6: Integrate attribution into summarizer

**Files:**
- Modify: `src/lib/summary/summarizer.ts:248-308` (overall briefing section)

**Step 1: Add imports**

At the top of `summarizer.ts`, add:

```typescript
import {
  ATTRIBUTION_SYSTEM_PROMPT,
  buildSectionAttributionPrompt,
  buildExecSummaryAttributionPrompt,
  buildSentimentAttributionPrompt,
  parseSectionAttributionResult,
  parseTextAttributionResult,
  parseSentimentAttributionResult,
  stripInvalidMarkers,
} from './attribution'
```

**Step 2: Add the attribution orchestration function**

After the `buildPartialResult` function at the end of the file, add:

```typescript
/**
 * Run post-hoc citation attribution on the overall briefing.
 *
 * Inserts [N] markers by matching claims to sources in dedicated LLM calls:
 * - Section entries: cheap model, scoped to each section's sensor sources
 * - Executive summary: strong model, full source pool
 * - Sentiment: strong model, full source pool
 *
 * All calls run in parallel. On failure, text is left without markers (graceful degradation).
 */
async function attributeCitations(
  overall: ReturnType<typeof parseOverallJson>,
  globalSources: BriefingSource[],
  sections: SensorSummary[],
  strongConfig: LlmConfig,
  cheapConfig: LlmConfig,
  signal?: AbortSignal,
): Promise<void> {
  if (globalSources.length === 0) return

  const validIds = new Set(globalSources.map(s => s.id))

  // Build a lookup: sensor label → source IDs for that sensor
  const sensorSourceMap = new Map<string, BriefingSource[]>()
  for (const src of globalSources) {
    const existing = sensorSourceMap.get(src.sensor) ?? []
    existing.push(src)
    sensorSourceMap.set(src.sensor, existing)
  }

  const promises: Promise<void>[] = []

  // Section entry attribution (cheap model, parallel per section)
  for (const section of overall.sections) {
    if (section.entries.length === 0) continue

    // Collect sources from all sensors mentioned in this section's entries
    const sectionSources: BriefingSource[] = []
    const seenIds = new Set<number>()
    for (const entry of section.entries) {
      const entrySources = sensorSourceMap.get(entry.source) ?? []
      for (const s of entrySources) {
        if (!seenIds.has(s.id)) {
          seenIds.add(s.id)
          sectionSources.push(s)
        }
      }
    }
    // Fallback: if no sources matched (bad source field), use all sources
    const pool = sectionSources.length > 0 ? sectionSources : globalSources

    promises.push(
      chatCompletion([
        { role: 'system', content: ATTRIBUTION_SYSTEM_PROMPT },
        { role: 'user', content: buildSectionAttributionPrompt(section.entries, pool) },
      ], cheapConfig, signal).then(raw => {
        const attributed = parseSectionAttributionResult(raw, section.entries.length)
        if (attributed) {
          for (let i = 0; i < section.entries.length; i++) {
            section.entries[i].text = stripInvalidMarkers(attributed[i], validIds)
          }
        }
      }).catch(() => {
        // Graceful degradation — entries keep clean text
      }),
    )
  }

  // Executive summary attribution (strong model)
  if (overall.executive_summary) {
    promises.push(
      chatCompletion([
        { role: 'system', content: ATTRIBUTION_SYSTEM_PROMPT },
        { role: 'user', content: buildExecSummaryAttributionPrompt(overall.executive_summary, globalSources) },
      ], strongConfig, signal).then(raw => {
        const attributed = parseTextAttributionResult(raw)
        overall.executive_summary = stripInvalidMarkers(attributed, validIds)
      }).catch(() => {
        // Graceful degradation
      }),
    )
  }

  // Sentiment attribution (strong model)
  const hasSentiment = overall.sentiment.controversies.length > 0
    || overall.sentiment.opinion_shifts.length > 0
    || overall.sentiment.risk_flags.length > 0

  if (hasSentiment) {
    promises.push(
      chatCompletion([
        { role: 'system', content: ATTRIBUTION_SYSTEM_PROMPT },
        { role: 'user', content: buildSentimentAttributionPrompt(
          overall.sentiment.controversies,
          overall.sentiment.opinion_shifts,
          overall.sentiment.risk_flags,
          globalSources,
        ) },
      ], strongConfig, signal).then(raw => {
        const attributed = parseSentimentAttributionResult(raw)
        if (attributed) {
          const applyToEntries = (entries: SentimentEntry[], texts: string[]) => {
            for (let i = 0; i < Math.min(entries.length, texts.length); i++) {
              entries[i].analysis = stripInvalidMarkers(texts[i], validIds)
            }
          }
          applyToEntries(overall.sentiment.controversies, attributed.controversies)
          applyToEntries(overall.sentiment.opinion_shifts, attributed.opinion_shifts)
          applyToEntries(overall.sentiment.risk_flags, attributed.risk_flags)
        }
      }).catch(() => {
        // Graceful degradation
      }),
    )
  }

  await Promise.all(promises)
}
```

**Step 3: Call attribution after overall briefing generation**

In the `summarizeReport` function, after line 303 (`overall.sources = globalSources`) and before `await onProgress?.('__overall__', 'Overall', 'ok', null)` (line 304), insert:

```typescript
    // Post-hoc citation attribution
    const cheapConfig: LlmConfig = options.attributionLlmConfig ?? llmConfig
    await attributeCitations(overall, globalSources, sections, llmConfig, cheapConfig, signal)
```

**Step 4: Add SensorSummary import if missing**

The `SensorSummary` type is already imported at line 3. Verify that `LlmConfig` is also imported (line 6). Both are already there.

**Step 5: Run type check and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: Type check clean, all tests pass

**Step 6: Commit**

```bash
git add src/lib/summary/summarizer.ts
git commit -m "feat: integrate post-hoc citation attribution into summarizer"
```

---

### Task 7: Update summarizer tests for attribution

**Files:**
- Modify: `src/lib/summary/summarizer.test.ts`

**Step 1: Verify existing tests still pass**

The existing summarizer tests mock `chatCompletion` and return pre-formatted JSON. Since the attribution step uses `chatCompletion` too, the mock needs to handle the attribution calls.

Check what the current mock setup looks like and add a pattern: when the system message contains `引用标注助手` (attribution system prompt), return a pass-through response.

In the test file's mock setup, add handling for attribution calls. The mock `chatCompletion` should detect attribution prompts and return the entries unchanged (wrapped in the expected format).

For section attribution calls (system contains `引用标注助手`), return:
```typescript
// Return entries unchanged as JSON array
const userMsg = messages.find(m => m.role === 'user')?.content ?? ''
const match = userMsg.match(/条目：\n([\s\S]*?)\n\n请为每个/)
if (match) {
  const lines = match[1].split('\n').filter(Boolean)
  const texts = lines.map(l => l.replace(/^\d+\.\s*"/, '').replace(/"$/, ''))
  return JSON.stringify(texts)
}
```

For exec summary attribution calls, return:
```typescript
return JSON.stringify({ attributed_text: /* original text from prompt */ })
```

For sentiment attribution calls, return:
```typescript
return JSON.stringify({ controversies: [], opinion_shifts: [], risk_flags: [] })
```

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/lib/summary/summarizer.test.ts`
Expected: All summarizer tests pass

**Step 3: Commit**

```bash
git add src/lib/summary/summarizer.test.ts
git commit -m "test: update summarizer tests for attribution calls"
```

---

### Task 8: Update remaining test fixtures

**Files:**
- Check: `src/lib/summary/route.test.ts`
- Check: `src/lib/summary/cache.test.ts`
- Check: `src/components/Briefing.test.tsx`

**Step 1: Check if any other tests break**

Run: `cd frontend && npx vitest run`

If all pass, no changes needed. The prompt changes (Task 4) don't affect test fixtures because tests mock the LLM responses directly.

If tests fail, fix the failing fixtures.

**Step 2: Commit if changes were needed**

```bash
git add -A
git commit -m "test: fix remaining test fixtures for attribution changes"
```

---

### Task 9: Final verification

**Step 1: Run full type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 3: Visual check (if dev server available)**

1. Start dev server: `cd frontend && npm run dev`
2. Open settings page, verify attribution model picker appears
3. Generate a briefing, verify citations render correctly

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — types check
- [ ] `npx vitest run` — all tests pass
- [ ] Settings UI shows attribution model picker when provider is enabled
- [ ] Attribution model defaults to empty (falls back to generation model)
- [ ] Overall prompt no longer contains `[N]` citation instructions
- [ ] New briefings get citations from post-hoc attribution pass
- [ ] Old cached briefings with `[N]` markers still render correctly
- [ ] Attribution failure degrades gracefully (clean text, no markers)
