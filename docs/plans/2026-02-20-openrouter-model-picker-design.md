# OpenRouter Model Picker — Design

## Summary

Replace the plain text `<input>` for the OpenRouter model field in the AI Summary
settings with a searchable dropdown that fetches available models from the
OpenRouter `/api/v1/models` endpoint. Each row shows the model ID, per-million
token pricing, and context window size.

## Decisions

| Decision                | Choice                     | Rationale                                         |
|-------------------------|----------------------------|---------------------------------------------------|
| Fetch path              | Client-side direct         | No API key needed for model listing; no backend route required |
| Component approach      | Dedicated picker component | Mirrors existing OllamaModelPicker; self-contained |
| Metadata shown          | Name + pricing + context   | Helps users make informed model choices            |
| Freeform input          | No (strict list only)      | Prevents typos; OpenRouter list is comprehensive   |

## Data Source

- **Endpoint**: `GET https://openrouter.ai/api/v1/models`
- **Auth**: None required
- **Response shape**: `{ data: Model[] }` where each model has `id`, `name`,
  `pricing.prompt`, `pricing.completion`, `context_length`
- **Payload size**: ~200KB for ~500 models — acceptable for a one-time fetch

## Component: `OpenRouterModelPicker`

### Props

```ts
interface OpenRouterModelPickerProps {
  value: string
  onChange: (modelId: string) => void
}
```

### Internal State

- `models: OpenRouterModel[]` — parsed model list
- `loading: boolean` — fetch in progress
- `error: string | null` — fetch error message
- `open: boolean` — dropdown visibility
- `search: string` — current search/filter text

### Behaviour

1. On mount, fetch the models list and parse into `{ id, name, promptPrice, completionPrice, contextLength }`
2. Search filters models where `id` or `name` includes the search term (case-insensitive)
3. Clicking a model row calls `onChange(model.id)` and closes the dropdown
4. Status line shows: "Loading…", "X models available", or error text
5. "Refresh" button re-fetches the list

### Row Layout

```
| anthropic/claude-sonnet-4       $3 / $15 · 200K |
```

- **Left**: model ID (0.8125rem, normal weight; selected = bold + accent color)
- **Right**: `$X / $Y` per million tokens + `·` + context as `XK`/`XM`
  (monospace, 0.6875rem, ink-faint)
- Pricing: raw per-token cost × 1,000,000, formatted to 2 significant figures

### Visual

- Matches existing OllamaModelPicker styling (inputBase, dropdown shadow, accent-wash highlight)
- Max dropdown height: 260px with overflow scroll
- Outside-click closes dropdown

## Integration

In `AiSummary.tsx`, the model field already branches on `isOllama`:

```tsx
{isOllama ? (
  <OllamaModelPicker ... />
) : (
  <input ... />  // ← replace this
)}
```

Change the else branch to:

```tsx
{isOllama ? (
  <OllamaModelPicker ... />
) : isEnabled ? (
  <OpenRouterModelPicker value={summaryModel} onChange={setSummaryModel} />
) : (
  <input disabled ... />
)}
```

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/AiSummary.tsx` | Add `OpenRouterModelPicker` component; swap `<input>` for it |

## No Backend Changes

The OpenRouter models API is public. No new API routes, proxy endpoints, or
backend config changes are needed.
