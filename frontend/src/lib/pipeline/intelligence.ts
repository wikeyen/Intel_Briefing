// ABOUTME: LLM-powered intelligence analysis pipeline — runs trend, topic, and account analyses in parallel.
// ABOUTME: Produces structured IntelligenceReport from fetched IntelItem data via chatCompletion.

import type { IntelItem, IntelReport, SummaryLanguage } from '../models'
import type { LlmConfig, ChatMessage } from '../summary/llm'
import { chatCompletion } from '../summary/llm'
import type { CategoryKey } from '../sensors/taxonomy'
import { ALL_CATEGORIES, SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'
import { jsonrepair } from 'jsonrepair'
import type { NlpCluster, NlpEnrichedItem } from './nlp-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelTag {
  text: string
  weight: number  // 0-1 normalized
  original?: string  // source-language text when tag was translated to match language setting
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

export interface TopicCuratedItem {
  title: string
  url: string
  brief: string
}

export interface TopicSentimentEntry {
  topic: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  summary: string
  items: TopicCuratedItem[]
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
  if (language === 'en') return '\n\nIMPORTANT: Write ALL text output (summary, topic names, tags, themes) in English. For each tag that was translated from a non-English source, include an "original" field with the tag text in its original source language.'
  if (language === 'zh') return '\n\nIMPORTANT: 所有文本输出（摘要、话题名称、标签、主题）必须使用中文。对于从非中文来源翻译的标签，添加 "original" 字段保留原始语言文本。'
  return ''
}

function trendSystemPrompt(language?: SummaryLanguage): string {
  return `You analyze trending topics from Chinese and international platforms to identify what the public is focused on.

Given a numbered list of trending items with source platforms and heat scores, you must:
1. Identify the top canonical topics (group related items)
2. For each topic: name, one-sentence summary, sentiment (positive/negative/neutral/mixed), which sources cover it, heat score (1-100)
3. Extract the top 20 tags (keywords/themes) with importance weights (0.0-1.0) and sentiment. If a tag was translated from a different source language, include an "original" field with the source-language text.

Respond with ONLY a JSON object, no markdown fences:
{"summary":"Overall paragraph about what people are focused on","topics":[{"name":"...","summary":"...","sentiment":"mixed","sources":["weibo","douyin"],"itemCount":5,"heat":85}],"tags":[{"text":"Artificial Intelligence","original":"人工智能","weight":0.9,"sentiment":"neutral"}]}` + langInstruction(language)
}

function topicSystemPrompt(language?: SummaryLanguage): string {
  return `You analyze social media posts about specific topics to understand public opinion and surface the most noteworthy content.

Given posts grouped by topic (each post has a title and URL), you must:
1. Assess the public sentiment on each topic
2. Curate the 3-8 most noteworthy posts per topic — pick posts with the highest informational value, unique insights, or significant developments
3. Extract cross-topic tags with importance weights and sentiment

IMPORTANT: The posts are ordered by recency, NOT by popularity or engagement. There are no popularity metrics available. Curate based on content quality, informational value, and significance — not position in the list.

If a tag was translated from a different source language, include an "original" field with the source-language text.

Respond with ONLY JSON:
{"summary":"Overall paragraph","topics":[{"topic":"AI","sentiment":"positive","summary":"People are optimistic about...","items":[{"title":"Post title","url":"https://...","brief":"Why this post matters"}],"postCount":15}],"tags":[{"text":"Artificial Intelligence","original":"人工智能","weight":0.8,"sentiment":"positive"}]}` + langInstruction(language)
}

function accountsSystemPrompt(language?: SummaryLanguage): string {
  return `You analyze posts from social media accounts to identify their focus areas and opinions.

Given posts grouped by account, identify what each account focuses on and their overall sentiment. If a tag was translated from a different source language, include an "original" field with the source-language text.

Respond with ONLY JSON:
{"summary":"Overall paragraph about what these voices are discussing","accounts":[{"account":"@user","handle":"user","platform":"x","themes":["AI","crypto"],"sentiment":"neutral","postCount":5}],"tags":[{"text":"Artificial Intelligence","original":"人工智能","weight":0.8,"sentiment":"neutral"}]}` + langInstruction(language)
}

function clusterSummaryPrompt(language?: SummaryLanguage): string {
  return `You are given a pre-analyzed cluster of related news items. Write a concise 2-3 sentence summary of what this cluster is about and why it matters. Also extract 3-5 meaningful tags (themes, technologies, organizations) that characterize this cluster.

Tags should be high-level concepts, NOT account handles, platform names, or generic terms like "breaking news". If a tag was translated from a different source language, include an "original" field with the source-language text.

Respond with ONLY JSON:
{"summary":"Your 2-3 sentence summary here","tags":[{"text":"Artificial Intelligence","weight":0.9,"sentiment":"neutral"},{"text":"Regulation","original":"监管","weight":0.7,"sentiment":"mixed"}]}` + langInstruction(language)
}

function accountsSummaryPrompt(language?: SummaryLanguage): string {
  return `You are given tracked social media accounts with their pre-analyzed themes and sentiment. Write a concise paragraph summarizing what these voices are collectively discussing and their overall tone. Also extract 10-15 meaningful tags (themes, technologies, organizations) that characterize what these voices are focused on.

Tags should be high-level concepts, NOT account handles, platform names, or generic terms like "breaking news". If a tag was translated from a different source language, include an "original" field with the source-language text.

Respond with ONLY JSON:
{"summary":"Your paragraph here","tags":[{"text":"Artificial Intelligence","weight":0.9,"sentiment":"neutral"}]}` + langInstruction(language)
}

function riskScanPrompt(language?: SummaryLanguage): string {
  return `You are given clusters that have been flagged as having negative or mixed sentiment. Identify the top 3-5 actionable risks or concerns. Each risk should have a title and a brief explanation referencing the source clusters.

Respond with ONLY JSON:
{"risks":[{"title":"Risk title","description":"Why this matters and what to watch","cluster_ids":[0,1]}]}` + langInstruction(language)
}

function executiveSummaryPrompt(language?: SummaryLanguage): string {
  return `You are given cluster summaries, risk assessments, and sentiment data. Write a comprehensive executive briefing paragraph (150-250 words) that synthesizes the key themes, connects patterns across clusters, and highlights what matters most.

Respond with ONLY JSON:
{"summary":"Your executive briefing paragraph"}` + langInstruction(language)
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
      const result: IntelTag = {
        text: String(tag.text ?? ''),
        weight: clampWeight(tag.weight),
        sentiment: normalizeSentiment(tag.sentiment),
      }
      if (typeof tag.original === 'string' && tag.original.length > 0) {
        result.original = tag.original
      }
      return result
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

    const messages: ChatMessage[] = [
      { role: 'system', content: trendSystemPrompt(language) },
      { role: 'user', content: numbered },
    ]

    const raw = await chatCompletion(messages, llmConfig, signal)

    let parsed = robustJsonParse(raw)
    if (!parsed) {
      // Retry once with JSON-fix nudge
      console.warn('[intelligence] trend: JSON parse failed, retrying. First 200 chars:', raw.slice(0, 200))
      const retryRaw = await chatCompletion(
        [
          ...messages,
          { role: 'assistant', content: raw },
          { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY the JSON object, no explanation or markdown fences.' },
        ],
        llmConfig,
        signal,
      )
      parsed = robustJsonParse(retryRaw)
      if (!parsed) {
        console.error('[intelligence] trend: failed to parse LLM JSON after retry. First 200 chars:', retryRaw.slice(0, 200))
        return null
      }
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
      const posts = topicItems.map((item, i) => `  [${i}] ${item.title} | ${item.url}`).join('\n')
      sections.push(`## Topic: ${topic} (${topicItems.length} posts)\n${posts}`)
    })

    const messages: ChatMessage[] = [
      { role: 'system', content: topicSystemPrompt(language) },
      { role: 'user', content: sections.join('\n\n') },
    ]

    const raw = await chatCompletion(messages, llmConfig, signal)

    let parsed = robustJsonParse(raw)
    if (!parsed) {
      // Retry once with JSON-fix nudge
      console.warn('[intelligence] topic: JSON parse failed, retrying. First 200 chars:', raw.slice(0, 200))
      const retryRaw = await chatCompletion(
        [
          ...messages,
          { role: 'assistant', content: raw },
          { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY the JSON object, no explanation or markdown fences.' },
        ],
        llmConfig,
        signal,
      )
      parsed = robustJsonParse(retryRaw)
      if (!parsed) {
        console.error('[intelligence] topic: failed to parse LLM JSON after retry. First 200 chars:', retryRaw.slice(0, 200))
        return null
      }
    }

    const topics: TopicSentimentEntry[] = Array.isArray(parsed.topics)
      ? parsed.topics
          .filter((t: unknown) => t && typeof t === 'object' && 'topic' in t)
          .map((t: unknown) => {
            const entry = t as Record<string, unknown>
            const rawItems = Array.isArray(entry.items) ? entry.items : []
            return {
              topic: String(entry.topic ?? ''),
              sentiment: normalizeSentiment(entry.sentiment),
              summary: String(entry.summary ?? ''),
              items: rawItems
                .filter((it: unknown) => it && typeof it === 'object' && 'title' in it)
                .map((it: unknown) => {
                  const item = it as Record<string, unknown>
                  return {
                    title: String(item.title ?? ''),
                    url: String(item.url ?? ''),
                    brief: String(item.brief ?? ''),
                  }
                }),
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

    const messages: ChatMessage[] = [
      { role: 'system', content: accountsSystemPrompt(language) },
      { role: 'user', content: sections.join('\n\n') },
    ]

    const raw = await chatCompletion(messages, llmConfig, signal)

    let parsed = robustJsonParse(raw)
    if (!parsed) {
      // Retry once with JSON-fix nudge
      console.warn('[intelligence] accounts: JSON parse failed, retrying. First 200 chars:', raw.slice(0, 200))
      const retryRaw = await chatCompletion(
        [
          ...messages,
          { role: 'assistant', content: raw },
          { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY the JSON object, no explanation or markdown fences.' },
        ],
        llmConfig,
        signal,
      )
      parsed = robustJsonParse(retryRaw)
      if (!parsed) {
        console.error('[intelligence] accounts: failed to parse LLM JSON after retry. First 200 chars:', retryRaw.slice(0, 200))
        return null
      }
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

    let tags = parseTags(parsed.tags)

    // Fallback: synthesize tags from account themes when LLM omits them
    if (tags.length === 0 && accounts.length > 0) {
      const freq = new Map<string, { count: number; sentiment: string }>()
      for (const acct of accounts) {
        for (const theme of acct.themes) {
          const key = theme.toLowerCase()
          const existing = freq.get(key)
          if (existing) {
            existing.count++
          } else {
            freq.set(key, { count: 1, sentiment: acct.sentiment })
          }
        }
      }
      const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count)
      const maxCount = sorted[0]?.[1].count ?? 1
      tags = sorted.slice(0, 20).map(([text, { count, sentiment }]) => ({
        text,
        weight: Math.round((count / maxCount) * 1000) / 1000,
        sentiment: normalizeSentiment(sentiment),
      }))
    }

    return {
      accounts,
      tags,
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

// ---------------------------------------------------------------------------
// NLP-first intelligence analysis
// ---------------------------------------------------------------------------

/** Section-split NLP data for the intelligence pipeline. */
export interface NlpSectionData {
  trendClusters: NlpCluster[]
  enrichmentMap: Map<string, NlpEnrichedItem>
}

/**
 * NLP-first intelligence analysis: Python sidecar handles structure,
 * LLM handles narrative. Uses section-split data so each intelligence
 * section draws from its correct source items.
 */
export async function runNlpIntelligenceAnalysis(
  report: IntelReport,
  nlpSectionData: NlpSectionData,
  llmConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<IntelligenceReport> {
  const { trendClusters, enrichmentMap } = nlpSectionData

  // Collect all items for section splitting and lookups
  const allItems: IntelItem[] = []
  for (const cat of ALL_CATEGORIES) {
    allItems.push(...(report.items[cat] ?? []))
  }
  const allItemsById = new Map(allItems.map(i => [i.id, i]))

  // Split items by section (same as legacy pipeline)
  const topicItems = allItems.filter(i => i.topic != null && i.topic.length > 0)
  const accountItems = allItems.filter(
    i => i.account != null && i.account.length > 0 && SENSOR_CATEGORY_MAP[i.source] === 'social'
  )

  // --- Trend / Public Focus: cluster summaries (parallel LLM calls) ---
  const clusterSummaries = await Promise.all(
    trendClusters.map(async (cluster) => {
      const repTitles = cluster.representative_items
        .map(id => allItemsById.get(id)?.title)
        .filter(Boolean)
        .slice(0, 5)

      const messages: ChatMessage[] = [
        { role: 'system', content: clusterSummaryPrompt(language) },
        { role: 'user', content: `Cluster: "${cluster.label}"
Keywords: ${cluster.top_keywords.map(k => k.text).join(', ')}
Sentiment: ${Object.entries(cluster.sentiment_distribution).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`).join(', ')}
Items (${cluster.item_ids.length} total):
${repTitles.map((t, i) => `  [${i}] ${t}`).join('\n')}` },
      ]

      try {
        const raw = await chatCompletion(messages, llmConfig, signal)
        const parsed = robustJsonParse(raw)
        return {
          cluster,
          summary: typeof parsed?.summary === 'string' ? parsed.summary : '',
          tags: parseTags(parsed?.tags),
        }
      } catch {
        return { cluster, summary: '', tags: [] }
      }
    })
  )

  // --- Topic intelligence (1 LLM call) ---
  let topicResult: TopicIntelligence | null = null
  if (topicItems.length > 0) {
    // Group items by topic keyword
    const byTopic = new Map<string, IntelItem[]>()
    for (const item of topicItems) {
      const topic = item.topic!
      if (!byTopic.has(topic)) byTopic.set(topic, [])
      byTopic.get(topic)!.push(item)
    }

    // Build grouped text block with NLP enrichment
    const sections: string[] = []
    byTopic.forEach((items, topic) => {
      const posts = items.map((item, i) => {
        const enriched = enrichmentMap.get(item.id)
        const sentiment = enriched?.sentiment.label ?? 'unknown'
        return `  [${i}] ${item.title} (${sentiment}) | ${item.url}`
      }).join('\n')
      sections.push(`## Topic: ${topic} (${items.length} posts)\n${posts}`)
    })

    try {
      const raw = await chatCompletion([
        { role: 'system', content: topicSystemPrompt(language) },
        { role: 'user', content: sections.join('\n\n') },
      ], llmConfig, signal)

      let parsed = robustJsonParse(raw)
      if (!parsed) {
        const retryRaw = await chatCompletion([
          { role: 'system', content: topicSystemPrompt(language) },
          { role: 'user', content: sections.join('\n\n') },
          { role: 'assistant', content: raw },
          { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY the JSON object, no explanation or markdown fences.' },
        ], llmConfig, signal)
        parsed = robustJsonParse(retryRaw)
      }

      if (parsed) {
        const topics: TopicSentimentEntry[] = Array.isArray(parsed.topics)
          ? parsed.topics
              .filter((t: unknown) => t && typeof t === 'object' && 'topic' in t)
              .map((t: unknown) => {
                const entry = t as Record<string, unknown>
                const rawItems = Array.isArray(entry.items) ? entry.items : []
                return {
                  topic: String(entry.topic ?? ''),
                  sentiment: normalizeSentiment(entry.sentiment),
                  summary: String(entry.summary ?? ''),
                  items: rawItems
                    .filter((it: unknown) => it && typeof it === 'object' && 'title' in it)
                    .map((it: unknown) => {
                      const item = it as Record<string, unknown>
                      return {
                        title: String(item.title ?? ''),
                        url: String(item.url ?? ''),
                        brief: String(item.brief ?? ''),
                      }
                    }),
                  postCount: typeof entry.postCount === 'number' ? entry.postCount : 0,
                }
              })
          : []

        topicResult = {
          topics,
          tags: parseTags(parsed.tags),
          summary: typeof parsed.summary === 'string' ? parsed.summary : '',
          generated_at: new Date().toISOString(),
        }
      }
    } catch (err) {
      console.error('[intelligence] NLP topic analysis failed:', err)
    }
  }

  // --- Accounts summary (1 LLM call) ---
  let accountsSummary = ''
  let accountTags: IntelTag[] = []
  const accountsFocusMap = new Map<string, { themes: Set<string>; sentiment: string; count: number; handle: string; platform: string }>()

  for (const item of accountItems) {
    const enriched = enrichmentMap.get(item.id)
    const existing = accountsFocusMap.get(item.account!)
    if (existing) {
      existing.count++
      enriched?.keywords.forEach(k => existing.themes.add(k.text))
    } else {
      accountsFocusMap.set(item.account!, {
        themes: new Set(enriched?.keywords.map(k => k.text) ?? []),
        sentiment: enriched?.sentiment.label ?? 'neutral',
        count: 1,
        handle: item.handle ?? item.account!,
        platform: item.source,
      })
    }
  }

  if (accountsFocusMap.size > 0) {
    const acctLines = [...accountsFocusMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30)
      .map(([name, data]) =>
        `@${data.handle} (${data.platform}, ${data.count} posts, ${data.sentiment}): ${[...data.themes].slice(0, 5).join(', ')}`)
      .join('\n')

    try {
      const raw = await chatCompletion([
        { role: 'system', content: accountsSummaryPrompt(language) },
        { role: 'user', content: `${accountsFocusMap.size} tracked accounts:\n${acctLines}` },
      ], llmConfig, signal)
      const parsed = robustJsonParse(raw)
      if (typeof parsed?.summary === 'string') accountsSummary = parsed.summary
      accountTags = parseTags(parsed?.tags)
    } catch { /* continue without accounts summary */ }
  }

  // --- Risk scan (1 LLM call) ---
  const negativeClusters = clusterSummaries.filter(
    cs => (cs.cluster.sentiment_distribution.negative ?? 0) > 0.3
  )

  let risks: Array<{ title: string; description: string }> = []
  if (negativeClusters.length > 0) {
    const riskInput = negativeClusters.map(cs =>
      `Cluster "${cs.cluster.label}" (${Math.round((cs.cluster.sentiment_distribution.negative ?? 0) * 100)}% negative): ${cs.summary}`
    ).join('\n')

    try {
      const raw = await chatCompletion([
        { role: 'system', content: riskScanPrompt(language) },
        { role: 'user', content: riskInput },
      ], llmConfig, signal)
      const parsed = robustJsonParse(raw)
      if (Array.isArray(parsed?.risks)) {
        risks = parsed.risks.filter((r: unknown) =>
          r && typeof r === 'object' && 'title' in r && 'description' in r
        ).map((r: Record<string, unknown>) => ({
          title: String(r.title),
          description: String(r.description),
        }))
      }
    } catch { /* continue without risks */ }
  }

  // --- Executive summary (1 LLM call, needs cluster summaries) ---
  let executiveSummary = ''
  const execInput = clusterSummaries
    .map(cs => `[${cs.cluster.label}]: ${cs.summary}`)
    .join('\n')
  const riskSection = risks.length > 0
    ? '\n\nRisks:\n' + risks.map(r => `- ${r.title}: ${r.description}`).join('\n')
    : ''

  try {
    const raw = await chatCompletion([
      { role: 'system', content: executiveSummaryPrompt(language) },
      { role: 'user', content: `${clusterSummaries.length} topic clusters:\n${execInput}${riskSection}` },
    ], llmConfig, signal)
    const parsed = robustJsonParse(raw)
    if (typeof parsed?.summary === 'string') executiveSummary = parsed.summary
  } catch { /* continue without executive summary */ }

  // --- Assemble into IntelligenceReport (backward-compatible shape) ---
  // Map clusters to TrendIntelligence topics
  const trendTopics: TrendTopic[] = clusterSummaries.map(cs => ({
    name: cs.cluster.label,
    summary: cs.summary,
    sources: [...new Set(cs.cluster.item_ids
      .map(id => allItemsById.get(id)?.source)
      .filter(Boolean) as string[])],
    itemCount: cs.cluster.item_ids.length,
    sentiment: dominantSentiment(cs.cluster.sentiment_distribution),
    heat: Math.round(cs.cluster.item_ids.length),
  }))

  // Aggregate tags from LLM cluster summaries
  const trendTagFreq = new Map<string, { weight: number; sentiment: string; original?: string }>()
  for (const cs of clusterSummaries) {
    for (const tag of cs.tags) {
      const key = tag.text.toLowerCase()
      const existing = trendTagFreq.get(key)
      if (existing) {
        existing.weight = Math.max(existing.weight, tag.weight)
      } else {
        trendTagFreq.set(key, {
          weight: tag.weight,
          sentiment: tag.sentiment ?? 'neutral',
          original: tag.original,
        })
      }
    }
  }
  const sortedTrendTags = [...trendTagFreq.entries()].sort((a, b) => b[1].weight - a[1].weight)
  const tags: IntelTag[] = sortedTrendTags.slice(0, 25).map(([text, { weight, sentiment, original }]) => ({
    text,
    weight,
    ...(original ? { original } : {}),
    sentiment: normalizeSentiment(sentiment),
  }))

  // Build accounts focus list
  const accounts: AccountFocus[] = [...accountsFocusMap.entries()].map(([name, data]) => ({
    account: name,
    handle: data.handle,
    platform: data.platform,
    themes: [...data.themes].slice(0, 5),
    sentiment: normalizeSentiment(data.sentiment),
    postCount: data.count,
  }))

  return {
    trend: trendTopics.length > 0 ? {
      topics: trendTopics,
      tags,
      summary: executiveSummary,
      generated_at: new Date().toISOString(),
    } : null,
    topics: topicResult,
    accounts: accounts.length > 0 ? {
      accounts,
      tags: accountTags.length > 0 ? accountTags : tags.slice(0, 20),
      summary: accountsSummary,
      generated_at: new Date().toISOString(),
    } : null,
  }
}

/** Pick the dominant sentiment from a distribution. */
function dominantSentiment(dist: Record<string, number>): 'positive' | 'negative' | 'neutral' | 'mixed' {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1])
  if (!entries.length) return 'neutral'
  const [top, topVal] = entries[0]
  if (topVal < 0.5 && entries.length > 1) return 'mixed'
  return normalizeSentiment(top)
}
