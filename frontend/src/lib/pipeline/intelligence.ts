// ABOUTME: LLM-powered intelligence analysis pipeline — runs trend, topic, and account analyses in parallel.
// ABOUTME: Produces structured IntelligenceReport from fetched IntelItem data via chatCompletion.

import type { IntelItem, IntelReport, SummaryLanguage } from '../models'
import type { LlmConfig } from '../summary/llm'
import { chatCompletion } from '../summary/llm'
import type { CategoryKey } from '../sensors/taxonomy'
import { ALL_CATEGORIES, SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'
import { jsonrepair } from 'jsonrepair'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelTag {
  text: string
  weight: number  // 0-1 normalized
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'
}

export interface TrendTopic {
  name: string
  summary: string
  sources: string[]
  itemCount: number
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  heat: number
}

export interface TrendIntelligence {
  topics: TrendTopic[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

export interface TopicSentimentEntry {
  topic: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  summary: string
  samplePosts: string[]
  postCount: number
}

export interface TopicIntelligence {
  topics: TopicSentimentEntry[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

export interface AccountFocus {
  account: string
  handle: string
  platform: string
  themes: string[]
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  postCount: number
}

export interface AccountsIntelligence {
  accounts: AccountFocus[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

export interface IntelligenceReport {
  trend: TrendIntelligence | null
  topics: TopicIntelligence | null
  accounts: AccountsIntelligence | null
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/** Build a language instruction suffix for the given language. */
function langInstruction(language?: SummaryLanguage): string {
  if (language === 'en') return '\n\nIMPORTANT: Write ALL text output (summary, topic names, tags, themes) in English.'
  if (language === 'zh') return '\n\nIMPORTANT: 所有文本输出（摘要、话题名称、标签、主题）必须使用中文。'
  return ''
}

function trendSystemPrompt(language?: SummaryLanguage): string {
  return `You analyze trending topics from Chinese and international platforms to identify what the public is focused on.

Given a numbered list of trending items with source platforms and heat scores, you must:
1. Identify the top canonical topics (group related items)
2. For each topic: name, one-sentence summary, sentiment (positive/negative/neutral/mixed), which sources cover it, heat score (1-100)
3. Extract the top 20 tags (keywords/themes) with importance weights (0.0-1.0) and sentiment

Respond with ONLY a JSON object, no markdown fences:
{"summary":"Overall paragraph about what people are focused on","topics":[{"name":"...","summary":"...","sentiment":"mixed","sources":["weibo","douyin"],"itemCount":5,"heat":85}],"tags":[{"text":"...","weight":0.9,"sentiment":"neutral"}]}` + langInstruction(language)
}

function topicSystemPrompt(language?: SummaryLanguage): string {
  return `You analyze social media posts about specific topics to understand public opinion.

Given posts grouped by topic, assess the public sentiment on each topic.

Respond with ONLY JSON:
{"summary":"Overall paragraph","topics":[{"topic":"AI","sentiment":"positive","summary":"People are optimistic about...","samplePosts":["post1","post2"],"postCount":15}],"tags":[{"text":"...","weight":0.8,"sentiment":"positive"}]}` + langInstruction(language)
}

function accountsSystemPrompt(language?: SummaryLanguage): string {
  return `You analyze posts from social media accounts to identify their focus areas and opinions.

Given posts grouped by account, identify what each account focuses on and their overall sentiment.

Respond with ONLY JSON:
{"summary":"Overall paragraph about what these voices are discussing","accounts":[{"account":"@user","handle":"user","platform":"x","themes":["AI","crypto"],"sentiment":"neutral","postCount":5}],"tags":[{"text":"...","weight":0.8,"sentiment":"neutral"}]}` + langInstruction(language)
}

// ---------------------------------------------------------------------------
// JSON parsing — robust extraction from LLM output
// ---------------------------------------------------------------------------

const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral', 'mixed'])

/** Strip LLM reasoning blocks (<think>...</think>) and markdown code fences. */
function stripLlmWrapper(text: string): string {
  // Remove <think>...</think> blocks (Qwen, DeepSeek, etc.)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Remove markdown code fences
  const fenced = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : cleaned
}

/**
 * Robustly parse a JSON object from LLM output.
 * Tries: direct parse -> extract outermost braces -> jsonrepair.
 */
export function robustJsonParse(raw: string): Record<string, unknown> | null {
  const cleaned = stripLlmWrapper(raw)

  // 1. Direct parse
  try {
    const result = JSON.parse(cleaned)
    if (result && typeof result === 'object') return result
  } catch { /* continue */ }

  // 2. Extract outermost { ... } and try again
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1)
    try {
      const result = JSON.parse(slice)
      if (result && typeof result === 'object') return result
    } catch { /* continue */ }

    // 3. Repair broken JSON (unescaped quotes, trailing commas, etc.)
    try {
      const repaired = jsonrepair(slice)
      const result = JSON.parse(repaired)
      if (result && typeof result === 'object') return result
    } catch { /* give up */ }
  }

  return null
}

/** Clamp a number to [0, 1]. */
function clampWeight(v: unknown): number {
  if (typeof v !== 'number') return 0
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000
}

/** Validate and normalize a sentiment string. */
function normalizeSentiment(v: unknown): 'positive' | 'negative' | 'neutral' | 'mixed' {
  if (typeof v === 'string' && VALID_SENTIMENTS.has(v)) {
    return v as 'positive' | 'negative' | 'neutral' | 'mixed'
  }
  return 'neutral'
}

/** Parse tags array from raw parsed JSON. */
function parseTags(raw: unknown): IntelTag[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t: unknown) => t && typeof t === 'object' && 'text' in t)
    .map((t: unknown) => {
      const tag = t as Record<string, unknown>
      return {
        text: String(tag.text ?? ''),
        weight: clampWeight(tag.weight),
        sentiment: normalizeSentiment(tag.sentiment),
      }
    })
    .filter(t => t.text.length > 0)
}

// ---------------------------------------------------------------------------
// Trend intelligence
// ---------------------------------------------------------------------------

/**
 * Analyze trending items to identify canonical topics, sentiment, and tags.
 * Returns null if no items are provided or the LLM call fails.
 */
export async function analyzeTrendIntelligence(
  items: IntelItem[],
  llmConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<TrendIntelligence | null> {
  if (items.length === 0) return null

  try {
    // Build numbered list: [0] Title (source, heat: 85)
    const numbered = items.map((item, i) => {
      const heat = item.heat ?? 'n/a'
      return `[${i}] ${item.title} (${item.source}, heat: ${heat})`
    }).join('\n')

    const raw = await chatCompletion(
      [
        { role: 'system', content: trendSystemPrompt(language) },
        { role: 'user', content: numbered },
      ],
      llmConfig,
      signal,
    )

    const parsed = robustJsonParse(raw)
    if (!parsed) {
      console.error('[intelligence] trend: failed to parse LLM JSON. First 200 chars:', raw.slice(0, 200))
      return null
    }

    const topics: TrendTopic[] = Array.isArray(parsed.topics)
      ? parsed.topics
          .filter((t: unknown) => t && typeof t === 'object' && 'name' in t)
          .map((t: unknown) => {
            const topic = t as Record<string, unknown>
            return {
              name: String(topic.name ?? ''),
              summary: String(topic.summary ?? ''),
              sources: Array.isArray(topic.sources)
                ? topic.sources.map(String)
                : [],
              itemCount: typeof topic.itemCount === 'number' ? topic.itemCount : 0,
              sentiment: normalizeSentiment(topic.sentiment),
              heat: typeof topic.heat === 'number' ? topic.heat : 0,
            }
          })
      : []

    return {
      topics,
      tags: parseTags(parsed.tags),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      generated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[intelligence] trend analysis failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Topic intelligence
// ---------------------------------------------------------------------------

/**
 * Analyze items grouped by topic keyword to assess public sentiment per topic.
 * Returns null if no items have a topic field or the LLM call fails.
 */
export async function analyzeTopicIntelligence(
  items: IntelItem[],
  llmConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<TopicIntelligence | null> {
  if (items.length === 0) return null

  try {
    // Group items by topic keyword
    const byTopic = new Map<string, IntelItem[]>()
    for (const item of items) {
      const topic = item.topic!
      if (!byTopic.has(topic)) byTopic.set(topic, [])
      byTopic.get(topic)!.push(item)
    }

    // Build grouped text block
    const sections: string[] = []
    byTopic.forEach((topicItems, topic) => {
      const posts = topicItems.map((item, i) => `  [${i}] ${item.title}`).join('\n')
      sections.push(`## Topic: ${topic} (${topicItems.length} posts)\n${posts}`)
    })

    const raw = await chatCompletion(
      [
        { role: 'system', content: topicSystemPrompt(language) },
        { role: 'user', content: sections.join('\n\n') },
      ],
      llmConfig,
      signal,
    )

    const parsed = robustJsonParse(raw)
    if (!parsed) {
      console.error('[intelligence] topic: failed to parse LLM JSON. First 200 chars:', raw.slice(0, 200))
      return null
    }

    const topics: TopicSentimentEntry[] = Array.isArray(parsed.topics)
      ? parsed.topics
          .filter((t: unknown) => t && typeof t === 'object' && 'topic' in t)
          .map((t: unknown) => {
            const entry = t as Record<string, unknown>
            return {
              topic: String(entry.topic ?? ''),
              sentiment: normalizeSentiment(entry.sentiment),
              summary: String(entry.summary ?? ''),
              samplePosts: Array.isArray(entry.samplePosts)
                ? entry.samplePosts.map(String)
                : [],
              postCount: typeof entry.postCount === 'number' ? entry.postCount : 0,
            }
          })
      : []

    return {
      topics,
      tags: parseTags(parsed.tags),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      generated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[intelligence] topic analysis failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Accounts intelligence
// ---------------------------------------------------------------------------

/**
 * Analyze items grouped by social account to identify focus themes and sentiment.
 * Returns null if no items have an account field or the LLM call fails.
 */
export async function analyzeAccountsIntelligence(
  items: IntelItem[],
  llmConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<AccountsIntelligence | null> {
  if (items.length === 0) return null

  try {
    // Group items by account
    const byAccount = new Map<string, IntelItem[]>()
    for (const item of items) {
      const account = item.account!
      if (!byAccount.has(account)) byAccount.set(account, [])
      byAccount.get(account)!.push(item)
    }

    // Build grouped text block
    const sections: string[] = []
    byAccount.forEach((accountItems, account) => {
      const handle = accountItems[0]?.handle ?? account
      const platform = accountItems[0]?.source ?? 'unknown'
      const posts = accountItems.map((item, i) => `  [${i}] ${item.title}`).join('\n')
      sections.push(`## Account: ${account} (@${handle}, ${platform}, ${accountItems.length} posts)\n${posts}`)
    })

    const raw = await chatCompletion(
      [
        { role: 'system', content: accountsSystemPrompt(language) },
        { role: 'user', content: sections.join('\n\n') },
      ],
      llmConfig,
      signal,
    )

    const parsed = robustJsonParse(raw)
    if (!parsed) {
      console.error('[intelligence] accounts: failed to parse LLM JSON. First 200 chars:', raw.slice(0, 200))
      return null
    }

    const accounts: AccountFocus[] = Array.isArray(parsed.accounts)
      ? parsed.accounts
          .filter((a: unknown) => a && typeof a === 'object' && 'account' in a)
          .map((a: unknown) => {
            const entry = a as Record<string, unknown>
            return {
              account: String(entry.account ?? ''),
              handle: String(entry.handle ?? ''),
              platform: String(entry.platform ?? ''),
              themes: Array.isArray(entry.themes)
                ? entry.themes.map(String)
                : [],
              sentiment: normalizeSentiment(entry.sentiment),
              postCount: typeof entry.postCount === 'number' ? entry.postCount : 0,
            }
          })
      : []

    return {
      accounts,
      tags: parseTags(parsed.tags),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      generated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[intelligence] accounts analysis failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all three intelligence analyses in parallel on a fetched report.
 *
 * Extracts items by role:
 * - Trend items: from sensors in the 'trend' category
 * - Topic items: any item with a `topic` field set
 * - Account items: any item with an `account` field set
 *
 * Each analysis runs independently — failures in one do not affect others.
 */
export async function runIntelligenceAnalysis(
  report: IntelReport,
  llmConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<IntelligenceReport> {
  // Collect all items across categories
  const allItems: IntelItem[] = []
  for (const cat of ALL_CATEGORIES) {
    const catItems = report.items[cat as CategoryKey]
    if (catItems) allItems.push(...catItems)
  }

  // Trend items: from sensors whose category is 'trend'
  const trendItems = allItems.filter(
    item => SENSOR_CATEGORY_MAP[item.source] === 'trend',
  )

  // Topic items: any item with a non-empty topic field
  const topicItems = allItems.filter(
    item => item.topic != null && item.topic.length > 0,
  )

  // Account items: social sensor items with a non-empty account field.
  // Excludes RSS feeds/news — their `account` is just the feed title, not a social voice.
  const accountItems = allItems.filter(
    item => item.account != null && item.account.length > 0
      && SENSOR_CATEGORY_MAP[item.source] === 'social',
  )

  // Run all three analyses in parallel — each catches its own errors
  const [trend, topics, accounts] = await Promise.all([
    analyzeTrendIntelligence(trendItems, llmConfig, signal, language),
    analyzeTopicIntelligence(topicItems, llmConfig, signal, language),
    analyzeAccountsIntelligence(accountItems, llmConfig, signal, language),
  ])

  return { trend, topics, accounts }
}
