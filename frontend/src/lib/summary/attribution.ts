// ABOUTME: Post-hoc citation attribution — prompt builders, result parsers, and marker validation.
// ABOUTME: Used by the summarizer to insert [N] markers into clean text by matching claims to sources.

import type { BriefingEntry, BriefingSource, SentimentEntry } from '../models'

/**
 * System prompt for the attribution LLM.
 * Instructs the model to insert [N] citation markers after factual claims,
 * without modifying the original text content.
 */
export const ATTRIBUTION_SYSTEM_PROMPT = `你是一名引用标注助手。你的任务是在已有文本中插入引用标记 [N]，其中 N 是参考来源的编号。

规则：
- 在每个可追溯到具体来源的事实性陈述后插入 [N] 标记
- 不要修改原文的任何文字内容，只添加 [N] 标记
- 一个陈述可以有多个来源标记，如 [1][3]
- 如果某个陈述无法明确对应任何来源，不要添加标记
- 只使用提供的来源编号，不要编造不存在的编号
- 观点性总结和过渡句不需要标记`

/**
 * Build the user message for attributing section entries.
 * Each entry is numbered, and sources are scoped to sensors present in the entries.
 */
export function buildSectionAttributionPrompt(
  entries: BriefingEntry[],
  sources: BriefingSource[],
): string {
  // Collect unique sensor labels from entries to scope sources
  const entrySensors = new Set(entries.map(e => e.source))

  // Filter sources to those matching entry sensors
  const relevantSources = sources.filter(s => entrySensors.has(s.sensor))
  // Fall back to all sources if no match (defensive)
  const scopedSources = relevantSources.length > 0 ? relevantSources : sources

  const sourceList = scopedSources
    .map(s => `[${s.id}] "${s.title}" — ${s.sensor}${s.brief ? ` — ${s.brief}` : ''}`)
    .join('\n')

  const entryList = entries
    .map((e, i) => `${i + 1}. ${e.text}`)
    .join('\n')

  return `请为以下条目添加引用标记。

## 可用来源
${sourceList}

## 待标注条目
${entryList}

输出格式（严格JSON数组，不要添加 markdown 代码块标记）：
["标注后的条目1", "标注后的条目2", ...]

要求：
- 输出数组长度必须与输入条目数量完全一致（${entries.length}条）
- 每个元素是标注后的条目文本
- 严格输出合法JSON数组`
}

/**
 * Build the user message for attributing an executive summary block.
 * Uses all sources since the exec summary can reference anything.
 */
export function buildExecSummaryAttributionPrompt(
  text: string,
  sources: BriefingSource[],
): string {
  const sourceList = sources
    .map(s => `[${s.id}] "${s.title}" — ${s.sensor}${s.brief ? ` — ${s.brief}` : ''}`)
    .join('\n')

  return `请为以下综合分析文本添加引用标记。

## 可用来源
${sourceList}

## 待标注文本
${text}

输出格式（严格JSON，不要添加 markdown 代码块标记）：
{"attributed_text": "标注后的完整文本"}

要求：
- 不要修改原文内容，只插入 [N] 标记
- 严格输出合法JSON对象`
}

/**
 * Build the user message for attributing sentiment analysis entries.
 * Three categories: controversies, opinion shifts, risk flags.
 */
export function buildSentimentAttributionPrompt(
  controversies: SentimentEntry[],
  opinionShifts: SentimentEntry[],
  riskFlags: SentimentEntry[],
  sources: BriefingSource[],
): string {
  const sourceList = sources
    .map(s => `[${s.id}] "${s.title}" — ${s.sensor}${s.brief ? ` — ${s.brief}` : ''}`)
    .join('\n')

  const formatEntries = (entries: SentimentEntry[]): string =>
    entries.length === 0
      ? '（无）'
      : entries.map((e, i) => `${i + 1}. 主题：${e.topic}\n   分析：${e.analysis}`).join('\n')

  return `请为以下舆情分析条目添加引用标记。

## 可用来源
${sourceList}

## 争议话题
${formatEntries(controversies)}

## 舆论转向
${formatEntries(opinionShifts)}

## 风险信号
${formatEntries(riskFlags)}

输出格式（严格JSON，不要添加 markdown 代码块标记）：
{
  "controversies": [{"topic": "主题", "analysis": "标注后的分析"}],
  "opinion_shifts": [{"topic": "主题", "analysis": "标注后的分析"}],
  "risk_flags": [{"topic": "主题", "analysis": "标注后的分析"}]
}

要求：
- 每个类别的数组长度必须与输入一致
- topic 保持不变，只在 analysis 中插入 [N] 标记
- 如果输入某类别为空，输出对应空数组
- 严格输出合法JSON对象`
}

/** Strip markdown code fences (```json ... ```) that LLMs sometimes add. */
function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : text.trim()
}

/**
 * Parse the attribution result for section entries.
 * Expects a JSON array of strings. Returns null if count mismatch or parse failure.
 */
export function parseSectionAttributionResult(
  raw: string,
  expectedCount: number,
): string[] | null {
  const cleaned = stripCodeFences(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try extracting outermost [ ... ]
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    } else {
      return null
    }
  }

  if (!Array.isArray(parsed)) return null
  if (parsed.length !== expectedCount) return null

  return parsed.map(item => String(item))
}

/**
 * Parse the attribution result for executive summary or other free-text blocks.
 * Expects `{"attributed_text": "..."}`. Falls back to raw text if parsing fails.
 */
export function parseTextAttributionResult(raw: string): string {
  const cleaned = stripCodeFences(raw)

  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object' && typeof parsed.attributed_text === 'string') {
      return parsed.attributed_text
    }
  } catch {
    // Try extracting outermost { ... }
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1))
        if (parsed && typeof parsed === 'object' && typeof parsed.attributed_text === 'string') {
          return parsed.attributed_text
        }
      } catch { /* fall through */ }
    }
  }

  // Fallback: return the raw text as-is (LLM may have returned plain annotated text)
  return cleaned
}

/** Parsed sentiment attribution result with three entry categories. */
export interface SentimentAttributionResult {
  controversies: SentimentEntry[]
  opinion_shifts: SentimentEntry[]
  risk_flags: SentimentEntry[]
}

/**
 * Parse the attribution result for sentiment entries.
 * Returns the attributed categories or null on parse failure.
 */
export function parseSentimentAttributionResult(raw: string): SentimentAttributionResult | null {
  const cleaned = stripCodeFences(raw)

  let parsed: Record<string, unknown> | null = null
  try {
    const result = JSON.parse(cleaned)
    if (result && typeof result === 'object') parsed = result
  } catch {
    // Try extracting outermost { ... }
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const result = JSON.parse(cleaned.slice(start, end + 1))
        if (result && typeof result === 'object') parsed = result
      } catch {
        return null
      }
    } else {
      return null
    }
  }

  if (!parsed) return null

  const parseSentimentList = (arr: unknown): SentimentEntry[] =>
    Array.isArray(arr)
      ? arr
          .filter((e: unknown) => e && typeof e === 'object' && 'topic' in e)
          .map((e: unknown) => {
            const entry = e as Record<string, unknown>
            return {
              topic: String(entry.topic ?? ''),
              analysis: String(entry.analysis ?? ''),
              refs: [],
            }
          })
      : []

  return {
    controversies: parseSentimentList(parsed.controversies),
    opinion_shifts: parseSentimentList(parsed.opinion_shifts),
    risk_flags: parseSentimentList(parsed.risk_flags),
  }
}

/**
 * Remove [N] citation markers where N is not in the valid source ID set.
 * Preserves markers whose numeric ID appears in `validIds`.
 */
export function stripInvalidMarkers(text: string, validIds: Set<number>): string {
  return text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = parseInt(numStr, 10)
    return validIds.has(num) ? match : ''
  })
}
