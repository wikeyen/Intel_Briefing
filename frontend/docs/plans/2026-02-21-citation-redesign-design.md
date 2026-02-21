# Post-hoc Citation Attribution — Design Doc

## Problem

The current citation system asks the LLM to insert `[N]` markers during briefing generation. This approach is fundamentally unreliable:

- **Wrong mapping**: `[N]` numbers point to the wrong source
- **Irrelevant sources**: cited sources don't support the claim they're attached to
- **Hallucinated markers**: LLM invents `[N]` values that don't exist in the source list

The root cause is that generation and citation are conflated into one task. The LLM focuses on writing good analysis and treats citations as an afterthought.

## Solution: Separate Generation from Attribution

Split the pipeline into two phases:

1. **Generation phase** — LLM produces clean analysis text with no citation markers
2. **Attribution phase** — A dedicated LLM pass inserts `[N]` markers by matching claims to source items

This follows the industry pattern used by Perplexity, ChatGPT, and Gemini: generate first, cite second.

## Architecture

### Current Pipeline

```
Sensors → Per-sensor LLM (summary + [N] markers) → Overall LLM (briefing + [N] markers) → Render
```

### New Pipeline

```
Sensors → Per-sensor LLM (clean summary)
       → Overall LLM (clean briefing)
       → Attribution LLM (insert [N] markers post-hoc)
       → Render
```

### Attribution Phase Detail

All 10 attribution calls run in parallel:

| Component | Count | Model Tier | Source Pool |
|-----------|-------|------------|-------------|
| Section entries | ×8 | Cheap (attribution model) | Items from relevant sensor(s) only (~10-20 items) |
| Executive summary | ×1 | Strong (generation model) | All source items (~100-160 items) |
| Sentiment analysis | ×1 | Strong (generation model) | All source items (~100-160 items) |

Section attribution uses a cheap model because each call only matches a few entries against ~10-20 candidate sources — a trivial task.

Executive summary and sentiment use the strong model because they synthesize across all sensors and need the full source pool.

### Attribution Prompt Pattern

The attribution LLM receives:
- The clean generated text (entries or exec summary)
- A numbered source list with titles, URLs, and briefs
- Instructions to insert `[N]` markers after factual claims

It returns the same text with `[N]` markers inserted. This is a copying+annotation task, not generation — much more reliable.

```
你是引用标注助手。给定条目和候选来源，在事实性声明后插入 [N] 标记。

条目：
1. "OpenAI发布GPT-5，性能全面超越前代"

候选来源：
[1] "OpenAI Announces GPT-5" — hacker_news

规则：
- 在事实性声明后紧跟 [N] 标记
- 一个声明可以引用多个来源：[1][3]
- 不要修改原文内容，只插入标记
- 只使用列出的编号，严禁编造
- 无对应来源则不加标记

输出：["OpenAI发布GPT-5[1]，性能全面超越前代[1]"]
```

### Citation Targets

All citations link to original intel items (articles, posts) collected by sensors. No intermediate references to sections or sensor summaries.

## Model Configuration

### Config Changes

```typescript
// summary_attribution_model added alongside existing summary_model
interface Config {
  summary_model: string              // strong model for generation + hard attribution
  summary_attribution_model?: string // cheap model for section attribution
  // Falls back to summary_model if unset
}
```

### Settings UI

A second model picker in the Connection section:

- Label: "Attribution Model"
- Help text: "Cheaper model for per-section citation matching. Falls back to generation model if unset."
- Uses same OpenRouterModelPicker / OllamaModelPicker component
- Same provider and base URL as the generation model

### LLM Call Routing

| Call | Model Used |
|------|------------|
| Per-sensor summarization | `summary_model` |
| Overall briefing synthesis | `summary_model` |
| Section attribution (×8) | `summary_attribution_model` (or fallback) |
| Exec summary attribution | `summary_model` |
| Sentiment attribution | `summary_model` |

## File Changes

| File | Change |
|------|--------|
| `src/lib/summary/prompts.ts` | Remove citation/引用 instructions from sensor and overall prompts |
| `src/lib/summary/summarizer.ts` | Add attribution step after generation; wire parallel calls |
| `src/lib/summary/llm.ts` | Accept model config override per call |
| `src/lib/models.ts` | Add `summary_attribution_model` to config types |
| `src/api/client.ts` | Add `summary_attribution_model` to API config types |
| `src/components/AiSummary.tsx` | Add second model picker for attribution model |
| **New: `src/lib/summary/attribution.ts`** | Attribution prompt builder, result parser, marker validation |

### No Changes Needed

| File | Why |
|------|-----|
| `src/lib/summary/parse-json.ts` | Already handles text with/without `[N]` markers |
| `src/components/data/BriefingTab.tsx` | `TextWithRefs` already parses `[N]` and resolves against `globalSources` |

## Backward Compatibility

- Old cached briefings with legacy `refs` arrays still render via `TextWithRefs` fallback path
- Old briefings with existing `[N]` markers still render via `globalSources` lookup
- `summary_attribution_model` is optional — unset means strong model used everywhere (safe default)

## Error Handling

- If an attribution call fails (timeout, API error), the entry keeps its clean text with no markers
- Briefing still renders, just without citations for that section
- No crash, graceful degradation
- Invalid `[N]` markers (pointing to non-existent sources) are stripped during validation

## Validation

After each attribution call, validate that every `[N]` in the returned text corresponds to an actual source ID. Strip any hallucinated markers.
