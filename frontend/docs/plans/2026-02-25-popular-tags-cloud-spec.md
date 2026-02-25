# Popular Tags Cloud — UX & Behavioural Specification

**Component:** `PopularTagsCloud`
**Context:** Intel Briefing dashboard (`/dashboard`)
**Audience:** Product designers, frontend engineers
**Status:** Draft — pending implementation review

---

## 1. Purpose and Context

### Role within the dashboard

The Popular Tags Cloud is a secondary-navigation and sense-making widget. It sits inside the dashboard layout (within intelligence cards and sidebar regions) and provides an at-a-glance view of what the pipeline considers prominent across all fetched sources.

It is **not** the primary content. It supplements the executive summary, domain cards, and intelligence analyses by answering: *"What terms keep appearing, and how heavily?"*

### Intended user actions

| Action | Description |
|--------|-------------|
| **Scan** | Visually parse the cloud to identify dominant themes in < 3 seconds. Font size encodes prominence — the user should not need to count or compare numbers. |
| **Filter** | Click/tap a tag to filter downstream views (domain cards, trending items, intelligence detail panels) to items containing that tag. This is a cross-component action dispatched via shared state or URL query parameter. |
| **Explore** | Hover (web) or tap (mobile) a tag to reveal metadata: exact frequency, sentiment label, source distribution. This is a read-only inspection — no navigation occurs on hover alone. |

### What it replaces

The dashboard currently has two tag cloud implementations:

- **`TagCloud`** — static flex-wrapped pills, used in detail panels and grouped-by-sentiment views.
- **`AnimatedTagCloud`** — Archimedean spiral with spotlight cycling, used inside intelligence card previews.

This specification defines the canonical behaviour for both variants and any future tag cloud instance in the application. Where the two diverge (e.g., animation in compact cards vs. static in full-page panels), the spec calls it out explicitly.

---

## 2. Data Model

### Input schema

```typescript
interface TagCloudTag {
  /** Display label. Rendered as-is — no truncation by the component. */
  text: string

  /**
   * Normalised prominence score, 0.0–1.0.
   * Source: LLM-assigned weight from intelligence analysis pipeline.
   * 0.0 = least prominent tag in the set.
   * 1.0 = most prominent tag in the set.
   */
  weight: number

  /**
   * Sentiment classification assigned during intelligence analysis.
   * Used for colour mapping. Falls back to 'neutral' when absent.
   */
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'

  /**
   * Optional source category from sensor taxonomy.
   * Values: 'tech' | 'research' | 'finance' | 'products' | 'community' | 'social' | 'trend' | 'insights' | 'feeds'
   * Used only when colour strategy is set to category-based mode.
   */
  category?: string

  /**
   * Optional human-readable description or context snippet.
   * Shown in tooltip/metadata popover, never inline.
   * Max recommended length: 120 characters.
   */
  description?: string
}

interface TagCloudProps {
  /** Tag data. Pre-sorted by weight descending from the API layer. */
  tags: TagCloudTag[]

  /** Maximum tags to render. Excess tags are silently dropped from the tail. */
  maxTags?: number

  /** Colour mapping strategy. Default: 'sentiment'. */
  colorStrategy?: 'sentiment' | 'category' | 'monochrome'

  /** Enable the animated spiral layout (compact card variant). Default: false. */
  animated?: boolean

  /** Callback when a tag is selected. Receives the tag object. */
  onTagSelect?: (tag: TagCloudTag) => void

  /** Currently active/selected tag text, if any. */
  activeTag?: string

  /** Container style overrides. */
  style?: React.CSSProperties
}
```

### Sorting logic

1. Tags arrive pre-sorted by `weight` descending from the intelligence API.
2. The component does **not** re-sort internally. If the consumer passes unsorted data, render order follows array order.
3. After applying `maxTags`, the remaining set is what gets laid out. No further reordering for visual placement — the layout algorithm (flex-wrap or spiral) determines spatial position.

### Handling long-tail data

- **Tail truncation:** Tags beyond `maxTags` are dropped entirely. They are not collapsed into an "+N more" affordance — the cloud is a curated highlight, not an exhaustive list.
- **Default cap:** `maxTags = 30` for static layout, `maxTags = 15` for animated/compact layout.
- **Minimum viable set:** If fewer than 3 tags are provided, render them as static pills regardless of `animated` prop. A spiral with 1–2 words is visually incoherent.

### Handling outliers

- **Weight clamping:** All weights are clamped to `[0.0, 1.0]` before scaling. Values outside this range are coerced silently.
- **Dominant outlier:** If a single tag has weight >= 0.95 and the next-highest is <= 0.3, compress the leader to 0.85 and redistribute. This prevents one tag from visually overwhelming the cloud. See section 3 (Scaling Methodology) for the formula.

---

## 3. Scaling Methodology

### Frequency-to-font-size mapping

Use **logarithmic scaling** to compress the visual range and prevent high-weight tags from dominating disproportionately.

```
fontSize = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * log(1 + weight * (e - 1)) / log(e)
```

Which simplifies to:

```
fontSize = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * ln(1 + weight * (e - 1))
```

Where:
- `weight` is in [0.0, 1.0] (clamped)
- `e` = 2.718 (Euler's number)
- `ln` = natural logarithm

This produces:
- weight 0.0 -> `MIN_SIZE`
- weight 0.5 -> ~73% of the range (not 50%)
- weight 1.0 -> `MAX_SIZE`

The logarithmic curve compresses the top end, giving mid-weight tags more visual presence than linear mapping would.

### Font size bounds

| Context | Min size | Max size |
|---------|----------|----------|
| Static layout (detail panels, sidebar) | 0.6875rem (11px) | 1.375rem (22px) |
| Animated layout (compact card) | `max(7, containerWidth * 0.035)` px | `max(7, min(16, containerWidth * 0.085))` px |
| Mobile (<=480px) | 0.625rem (10px) | 1.125rem (18px) |

### Font weight mapping

| Weight range | `font-weight` |
|--------------|---------------|
| 0.0 – 0.39  | 400 (regular) |
| 0.4 – 0.69  | 500 (medium)  |
| 0.7 – 1.0   | 600 (semibold) |

### Handling extreme distribution skew

**Problem:** If all tags cluster at weight 0.8–1.0, logarithmic scaling still maps them to the top 30% of the font range, producing a visually flat cloud where nothing stands out.

**Solution — local normalisation:**

1. Compute `minW` and `maxW` from the actual tag set (after `maxTags` truncation).
2. If `maxW - minW < 0.15`, apply local normalisation:
   ```
   normalisedWeight = (tag.weight - minW) / (maxW - minW)
   ```
3. Then feed `normalisedWeight` into the logarithmic formula above.
4. If all weights are identical (`maxW === minW`), assign `normalisedWeight = 0.5` to all tags (uniform medium size).

This ensures visual differentiation even in tight distributions.

---

## 4. Layout Behaviour

### 4.1 Static layout (flex-wrap)

Used for: detail panels, sidebar widgets, full-page views, any non-animated context.

#### Web (>=1024px)

```css
display: flex;
flex-wrap: wrap;
gap: 0.375rem 0.5rem;        /* row-gap x column-gap */
align-items: baseline;
justify-content: flex-start;
```

- Tags flow left-to-right, wrapping naturally.
- Baseline alignment ensures text of different sizes reads on a shared line.
- No fixed height. Container grows with content.
- Maximum container width: constrained by parent (typically 100% of card interior).

#### Tablet (481px – 1023px)

Same flex-wrap behaviour. Gap reduces to `0.3rem 0.4rem`.

#### Mobile (<=480px)

Same flex-wrap behaviour with tighter constraints:
- Gap: `0.25rem 0.375rem`
- Font size bounds shift to mobile range (see section 3).
- If total tag count exceeds visual capacity (~3 rows), truncate to `maxTags = 20` and append no indicator.

### 4.2 Animated layout (spiral)

Used for: intelligence card compact previews.

#### Placement algorithm

Archimedean spiral from container centre:
- Angle step: 0.3 radians per iteration.
- Radius increment: 0.45px per step.
- Maximum placement attempts per tag: 600.
- If placement fails after 600 attempts, drop the tag silently.

#### Collision avoidance

- Each placed tag occupies a bounding rectangle (measured via offscreen `<canvas>` `measureText()`).
- Collision padding: 2px on all sides.
- Before placing a tag, test its bounding rect against all previously placed tags.
- Use axis-aligned bounding box (AABB) intersection — no rotation means no rotated-rect math needed.

#### Container sizing

- Fixed height: 120px.
- Width: 100% of parent.
- `overflow: hidden` — tags that escape the bounding box are clipped, not visible.
- `position: relative` on container, `position: absolute` on each tag.

#### Density

Target 60–70% fill ratio. If fewer than 5 tags, centre them without spiral — use simple centred flex row instead.

### 4.3 Orientation

**No rotation.** All text renders horizontally (0 degrees). Rationale:

- Rotated text harms readability on small screens.
- Baseline alignment is impossible with mixed orientations.
- Accessibility tools (screen readers, magnifiers) handle horizontal text correctly.
- The animated variant achieves visual interest through the orbital spotlight animation, not rotation.

Exception: if a future design review explicitly justifies 90-degree rotation for a decorative hero context (not a data dashboard), this constraint may be revisited. It does not apply to the current dashboard use case.

---

## 5. Visual Hierarchy

### Typography

| Element | Font family | Size | Weight | Line height |
|---------|-------------|------|--------|-------------|
| Tag label | `'Inter', system-ui, -apple-system, sans-serif` | Per section 3 scaling | Per section 3 weight map | 1.2 |
| Tooltip title | Same | 0.8125rem (13px) | 600 | 1.3 |
| Tooltip body | Same | 0.75rem (12px) | 400 | 1.4 |
| Frequency badge | `ui-monospace, SFMono-Regular, Menlo, monospace` | 0.625rem (10px) | 500 | 1 |

- **One font family** for tag labels. No decorative or display fonts.
- Monospace reserved for numeric metadata (frequency counts, percentages) inside tooltips or badges.

### Colour strategy

Three modes, selectable via `colorStrategy` prop. Default: `'sentiment'`.

#### Sentiment-based (default)

Maps `tag.sentiment` to the project's semantic colour tokens:

| Sentiment | Token | Light value | Dark value |
|-----------|-------|-------------|------------|
| positive | `--sent-pos` | `#3D9E85` | `#5CC4B4` |
| negative | `--sent-neg` | `#C4606E` | `#E07A87` |
| neutral | `--ink-tertiary` | `#A8A69F` | `#8A877F` |
| mixed | `--sent-mixed` | `#C48F54` | `#D4A56A` |

Tag text colour = sentiment token.
Tag background = `color-mix(in srgb, <token> 8%, transparent)`.
Tag hover background = `color-mix(in srgb, <token> 15%, transparent)`.

#### Category-based

Maps `tag.category` to category tokens:

| Category | Token |
|----------|-------|
| tech, research | `--cat-research` (#1A7A6D) |
| news, feeds | `--cat-news` (#2E7D9A) |
| trend, social, community | `--cat-trend` (#C4851C) |
| opinion, insights | `--cat-opinion` (#7E6B9A) |
| products, finance | `--accent` (#1A7A6D) |

Falls back to `--ink-tertiary` if category is missing or unrecognised.

#### Monochrome

All tags use `--ink-secondary` for text. Background follows the same `color-mix` pattern with `--ink-secondary`. Useful for contexts where sentiment data is unavailable or colour would compete with surrounding elements.

### Visual emphasis

- **Selected tag:** Text colour intensifies to the strong variant of its token (e.g., `--accent-strong`). Background opacity increases to 20%. A 1.5px bottom border in the token colour appears beneath the text.
- **High-weight tags (>=0.7):** Larger font + semibold weight provides sufficient emphasis. No additional decoration (no glow, no outline, no badge).
- **Low-weight tags (<=0.2):** Rendered at minimum font size with regular weight and reduced opacity (0.7). Still fully legible.

---

## 6. Interaction Model

### 6.1 Hover state (Web)

**Trigger:** `mouseenter` on tag element.
**Timing:** Immediate (no delay).

**Visual changes:**
- Background shifts from 8% to 15% opacity (`color-mix` blend).
- `filter: brightness(1.15)` on the text.
- `cursor: pointer`.
- Transition: `background 150ms ease, filter 150ms ease`.

**Metadata reveal:**
- After 400ms hover dwell time, show a tooltip/popover anchored to the tag.
- Tooltip contains: tag text (bold), frequency/weight as percentage, sentiment label, source count if available, description if present.
- Tooltip dismissed on `mouseleave` with 100ms fade-out.
- Tooltip positioned above the tag by default; flips below if insufficient viewport space above.

### 6.2 Tap state (Mobile)

**Trigger:** `touchend` on tag element.
**First tap:** Selects the tag (equivalent to click, see section 6.3). No separate hover preview.
**Long press (500ms):** Shows the same metadata popover as desktop hover. Dismissed on tap-outside.

Rationale: mobile has no hover. A single tap should perform the primary action (filter). Long press serves as the secondary inspection action.

### 6.3 Selected/active state

**Trigger:** Click (web) or tap (mobile) on a tag, or `activeTag` prop matches `tag.text`.

**Visual changes:**
- Tag receives selected styling (section 5, visual emphasis).
- All other tags reduce to 0.5 opacity.
- Transition: `opacity 180ms ease`.

**Deselection:**
- Click/tap the same tag again.
- Click/tap a different tag (switches selection).
- External clear action (e.g., a "Clear filter" button elsewhere in the dashboard).

### 6.4 Filtering behaviour

When a tag is selected:

1. Component calls `onTagSelect(tag)` with the full `TagCloudTag` object.
2. The consuming page is responsible for filtering downstream views.
3. The component itself does **not** filter or hide other tags — it only applies the dimmed visual state.
4. If the consuming page updates `activeTag` prop to `undefined`, the cloud resets to its default visual state.

### 6.5 Animation constraints

All transitions in the static layout variant:

| Property | Duration | Easing |
|----------|----------|--------|
| background-color | 150ms | ease |
| filter | 150ms | ease |
| opacity | 180ms | ease |
| transform (tooltip enter) | 150ms | cubic-bezier(0.4, 0, 0.2, 1) |
| transform (tooltip exit) | 100ms | ease-out |

For the animated variant (spiral + spotlight):

| Property | Duration | Easing |
|----------|----------|--------|
| Orbital rotation | Continuous, 0.08 rad/s | linear |
| Spotlight focus transition | 1500ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Spotlight cycle interval | 5000ms | n/a |
| Focused tag scale | 1.25x | via transition above |
| Unfocused tag opacity | 0.35 | via transition above |

No animation exceeds 1500ms. Hover/click feedback remains <= 200ms. Spotlight cycling is the only long-running animation and uses `requestAnimationFrame` with cleanup on unmount.

---

## 7. Accessibility Requirements

### Contrast ratios

All tag text must meet **WCAG 2.1 AA** minimum contrast ratios against their background:

| Element | Minimum ratio |
|---------|---------------|
| Tag text vs. tag background (normal text, < 18px) | 4.5:1 |
| Tag text vs. tag background (large text, >= 18px or >= 14px bold) | 3:1 |
| Tag text vs. page background (when tag bg is transparent) | 4.5:1 |
| Tooltip text vs. tooltip background | 4.5:1 |
| Focus indicator vs. surrounding area | 3:1 |

**Validation rule:** The `color-mix` background at 8% opacity is effectively transparent — contrast is measured against the page canvas (`--canvas`), not the tinted background. All sentiment/category tokens have been validated against both `--canvas` light (#FFFFFF) and dark (#151514) values.

Tags at low opacity (0.5 when another tag is selected, 0.7 for low-weight) must still meet 4.5:1 against `--canvas`. If a token at reduced opacity fails, increase it to the minimum passing opacity.

### Keyboard navigation

```
Tab         -> Focus enters the tag cloud container.
Arrow Right -> Move focus to the next tag (array order).
Arrow Left  -> Move focus to the previous tag.
Home        -> Focus the first tag.
End         -> Focus the last tag.
Enter/Space -> Select the focused tag (equivalent to click).
Escape      -> Deselect current tag, dismiss tooltip if open.
Tab         -> Focus exits the cloud to the next focusable element.
```

Focus indicator: 2px solid `--accent` outline with 2px offset. Visible on `:focus-visible` only (no outline on mouse click).

### ARIA roles and attributes

```html
<div role="list" aria-label="Popular tags">
  <button
    role="listitem"
    aria-pressed="{isSelected}"
    aria-label="{tag.text}, weight {Math.round(tag.weight * 100)} percent, sentiment {tag.sentiment}"
  >
    {tag.text}
  </button>
</div>
```

- Container: `role="list"` with descriptive `aria-label`.
- Each tag: `<button>` with `role="listitem"`, enabling both keyboard interaction and screen reader announcement.
- `aria-pressed` indicates selected state.
- `aria-label` includes weight and sentiment because visual encoding (size, colour) is not perceivable by screen readers.

### Screen reader behaviour

- On focus, announce: `"{tag text}, weight {N} percent, {sentiment}"`.
- On selection, announce: `"Selected: {tag text}"`.
- On deselection, announce: `"Deselected: {tag text}"`.
- The animated variant pauses spotlight cycling when any tag has keyboard focus, to prevent disorienting announcements.

### Minimum tap target size (Mobile)

- Each tag pill has a minimum touch target of **44 x 44px** (Apple HIG) / **48 x 48dp** (Material).
- Achieved via `min-height: 44px` and horizontal padding sufficient to reach 44px width even for short labels.
- If the computed tag size (font + padding) is smaller than 44px in either dimension, invisible padding extends the tap target without affecting visual appearance:
  ```css
  position: relative;
  &::after {
    content: '';
    position: absolute;
    inset: -4px -6px;      /* extend tap target */
    min-width: 44px;
    min-height: 44px;
  }
  ```

---

## 8. Performance Constraints

### Maximum recommended tag count

| Layout variant | Recommended max | Hard max |
|----------------|-----------------|----------|
| Static (flex-wrap) | 30 | 50 |
| Animated (spiral) | 15 | 25 |

Beyond the hard max, layout computation (especially spiral collision detection) degrades noticeably on mid-range mobile devices (tested: iPhone 12, Pixel 6).

### Lazy rendering strategy (> 100 tags)

Not applicable under normal operation — the intelligence pipeline caps at 20 tags per analysis type, yielding at most 60 tags across all three analyses. However, if a future data source provides unbounded tags:

1. **Virtual truncation:** Apply `maxTags` before any layout computation. Do not mount DOM nodes for tags beyond the cap.
2. **Deferred measurement:** In the animated variant, measure tag widths in a single batched `<canvas>` pass before any DOM insertion. Avoid interleaved measure-layout cycles.
3. **No virtualised scrolling.** Tag clouds are not scrollable lists. Truncation, not virtualisation, is the correct strategy.

### Reflow stability

- Tag positions must be stable across re-renders. React keys derived from `tag.text` (assumed unique within a cloud instance).
- In the animated variant, recalculate spiral positions only when `tags` array identity changes (referential equality check, not deep comparison).
- `ResizeObserver` triggers relayout on container width change. Debounce resize handling to 150ms to prevent thrashing during viewport drag.
- Hover/select state changes must **not** trigger relayout. Only visual properties (opacity, background, filter) change — no size or position shifts.

---

## 9. Failure Modes and Anti-Patterns

### Linear scaling distortion

**Problem:** Mapping weight directly to font size (`fontSize = minSize + weight * range`) creates a visually misleading distribution. A tag at weight 0.8 appears ~4x the area of a tag at weight 0.2 (because area scales with the square of font size), dramatically overstating the difference.

**Mitigation:** Logarithmic scaling (section 3) compresses the top end. Combined with local normalisation for tight distributions.

### Over-rotation

**Problem:** Random rotation angles (30, 45, 90 degrees) make text unreadable, break baseline alignment, and frustrate screen magnifiers.

**Mitigation:** Zero rotation. All text horizontal. No exceptions in the dashboard context (section 4.3).

### Visual clutter

**Problem:** Too many tags, too little whitespace, too many colours create a visual wall that users skip entirely.

**Mitigation:**
- Conservative `maxTags` defaults (15 animated, 30 static).
- Minimum `gap` values enforced (section 4.1).
- Maximum 4 colour categories in any single cloud instance (sentiment has 4, category map has 4 groups).
- Animated variant uses dimming (0.35 opacity on unfocused tags) to reduce visual load.

### Excessive colour usage

**Problem:** Assigning a unique colour to each tag or using high-saturation gradients creates a confetti effect that undermines the data visualisation purpose.

**Mitigation:**
- Colour is driven by a fixed 4-value classification (sentiment or category group), not per-tag.
- Monochrome mode available for contexts where colour is not informative.
- All colour tokens are muted/desaturated to match the dashboard's warm neutral palette.
- Background tinting at 8% opacity — colour is hint, not signal.

### Illegible minimum sizes

**Problem:** Tags at the bottom of the weight range rendered below 10px become unreadable, especially on mobile, and fail WCAG contrast at those sizes.

**Mitigation:**
- Absolute minimum: 10px (0.625rem) on mobile, 11px (0.6875rem) on desktop.
- Below these thresholds, the tag should be dropped (via `maxTags` truncation) rather than rendered illegibly.
- `font-weight: 400` at minimum size (not light/thin).

### Tooltip occlusion

**Problem:** Tooltip on hover/long-press covers adjacent tags, especially in dense mobile layouts.

**Mitigation:**
- Tooltip renders in a portal (outside the cloud's overflow context).
- Positioned above tag by default; auto-flips to below if within 80px of viewport top.
- On mobile, tooltip is centred horizontally on the tag and constrained to viewport edges with 12px margin.
- Only one tooltip visible at a time.

---

## Appendix A: Implementation Reference

### Existing components to consolidate

| Current component | Location | Disposition |
|-------------------|----------|-------------|
| `TagCloud` | `src/components/TagCloud.tsx` | Refactor into `PopularTagsCloud` with `animated={false}` |
| `AnimatedTagCloud` | Same file | Refactor into `PopularTagsCloud` with `animated={true}` |
| `GroupedTagCloud` | Same file | Keep as separate component (different purpose: sentiment grouping) |

### CSS custom property dependencies

The component depends on these tokens being defined in `globals.css`:

```
--canvas, --surface, --border, --border-strong
--ink, --ink-secondary, --ink-tertiary
--accent, --accent-strong, --accent-subtle
--sent-pos, --sent-neg, --sent-neu, --sent-mixed
--cat-research, --cat-news, --cat-trend, --cat-opinion
--shadow-xs, --shadow-card
```

### Data pipeline dependency

Tags originate from `IntelligenceReport.{trend,topics,accounts}.tags` arrays, each typed as `IntelTag[]` from `src/lib/pipeline/intelligence.ts`. The `category` and `description` fields in the proposed `TagCloudTag` interface are extensions not yet present in the pipeline output — they require upstream LLM prompt changes to populate.
