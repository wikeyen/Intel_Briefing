# Citation Redesign: Perplexity-style Global Source List

## Problem

The LLM generates per-entry `refs` arrays with inline `[N]` markers, but:
1. Uses global numbering while code expects per-entry numbering
2. Blends topics under a single citation
3. Halluccinates or mismatches sources
4. Generates expensive output tokens for refs arrays

## Design

**Perplexity-style:** Global numbered source list in input, `[N]` markers in text, code resolves refs.

### Data flow

1. Per-sensor summaries produce Notable items (unchanged)
2. Summarizer builds a **global numbered source list** from all Notable items
3. Overall LLM prompt includes numbered list + per-sensor trend summaries
4. LLM writes analysis with `[N]` markers — no refs arrays in output
5. Code attaches source list to briefing; frontend resolves `[N]` → source

### Output schema change

Before: each entry has `{ text, source, refs: [{title, url}] }`
After: entries have `{ text, source }`, briefing has top-level `sources: [{id, title, url, sensor, brief}]`

### Model change

Default: `anthropic/claude-sonnet-4` ($3/$15 per M tokens) → `deepseek/deepseek-v3.2` ($0.26/$0.38)
~22x cost reduction.

### Files modified

- `frontend/src/lib/models.ts` — add `BriefingSource`, update `OverallBriefing`
- `frontend/src/api/client.ts` — mirror type changes
- `frontend/src/lib/summary/prompts.ts` — rewrite overall prompt (no refs in schema)
- `frontend/src/lib/summary/summarizer.ts` — build global source list, simplified overall call
- `frontend/src/lib/summary/parse-json.ts` — handle optional refs
- `frontend/src/components/data/BriefingTab.tsx` — resolve from global sources, add Sources footer
- Tests updated accordingly
