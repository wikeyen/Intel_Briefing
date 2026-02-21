# Social Platform Cards — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 4 social sensor toggles (x_posts, social_accounts, social_topics, social_trends) with 3 per-platform cards (X, Bluesky, Mastodon) that each have their own toggle and nested sub-options.

**Architecture:** UI-first approach — update config model, taxonomy, sensor registry, and pipeline mapping so the UI presents per-platform cards while backend sensors gain a `platform` filter parameter. Migration layer translates old config keys to new.

**Tech Stack:** Next.js 15, TypeScript, inline styles, SQLite config store, js-yaml

---

### Task 1: Update ConfigSettings interface and defaults

**Files:**
- Modify: `frontend/src/lib/models.ts`

**Step 1: Add new fields to ConfigSettings interface**

In the interface (after line 272), add:

```typescript
  // Per-platform sub-toggles (Bluesky)
  bluesky_topics_enabled: boolean
  bluesky_trends_enabled: boolean
  // Per-platform sub-toggles (Mastodon)
  mastodon_topics_enabled: boolean
  mastodon_trends_enabled: boolean
```

**Step 2: Update defaultConfig()**

Replace the social sensor entries in `sensors_enabled` (lines 311-316):

```typescript
      // Old keys removed: social_accounts, social_topics, social_trends, x_posts
      x: true,
      bluesky: true,
      mastodon: true,
```

Add defaults for the new boolean fields (after `social_following_mastodon: false`):

```typescript
    bluesky_topics_enabled: true,
    bluesky_trends_enabled: true,
    mastodon_topics_enabled: true,
    mastodon_trends_enabled: true,
```

**Step 3: Commit**

```bash
git add frontend/src/lib/models.ts
git commit -m "feat(config): add per-platform social sensor fields to ConfigSettings"
```

---

### Task 2: Add migration for old social sensor keys

**Files:**
- Modify: `frontend/src/lib/config/index.ts`

**Step 1: Add migration rules to migrateConfig()**

After the existing `summary_provider` migration (line 119), add:

```typescript
  // x_posts → x
  const se = migrated.sensors_enabled as Record<string, boolean> | undefined
  if (se) {
    if ('x_posts' in se && !('x' in se)) se.x = se.x_posts
    delete se.x_posts
    // social_accounts → bluesky + mastodon
    if ('social_accounts' in se) {
      if (!('bluesky' in se)) se.bluesky = se.social_accounts
      if (!('mastodon' in se)) se.mastodon = se.social_accounts
      delete se.social_accounts
    }
    // social_topics → per-platform topics toggles
    if ('social_topics' in se) {
      if (!('bluesky_topics_enabled' in migrated)) migrated.bluesky_topics_enabled = se.social_topics
      if (!('mastodon_topics_enabled' in migrated)) migrated.mastodon_topics_enabled = se.social_topics
      delete se.social_topics
    }
    // social_trends → per-platform trends toggles
    if ('social_trends' in se) {
      if (!('bluesky_trends_enabled' in migrated)) migrated.bluesky_trends_enabled = se.social_trends
      if (!('mastodon_trends_enabled' in migrated)) migrated.mastodon_trends_enabled = se.social_trends
      delete se.social_trends
    }
  }
```

**Step 2: Commit**

```bash
git add frontend/src/lib/config/index.ts
git commit -m "feat(config): migrate old social sensor keys to per-platform model"
```

---

### Task 3: Update taxonomy — replace 4 social sensors with 3 platform entries

**Files:**
- Modify: `frontend/src/lib/sensors/taxonomy.ts`

**Step 1: Replace social sensor entries in SENSORS array**

Remove lines 23-26 (x_posts, social_accounts, social_topics, social_trends) and replace with:

```typescript
  { key: 'x',         label: 'X / Twitter', desc: 'Posts from monitored X accounts',               language: 'row', category: 'social' },
  { key: 'bluesky',   label: 'Bluesky',     desc: 'Accounts, topics, and trends on Bluesky',       language: 'row', category: 'social' },
  { key: 'mastodon',  label: 'Mastodon',     desc: 'Accounts, topics, and trends on Mastodon',      language: 'row', category: 'social' },
```

**Step 2: Commit**

```bash
git add frontend/src/lib/sensors/taxonomy.ts
git commit -m "feat(taxonomy): replace 4 social sensors with 3 platform entries"
```

---

### Task 4: Add platform filter to social sensor functions

**Files:**
- Modify: `frontend/src/lib/sensors/social_accounts.ts`
- Modify: `frontend/src/lib/sensors/social_topics.ts`
- Modify: `frontend/src/lib/sensors/social_trends.ts`

**Step 1: Update fetchSocialAccounts signature and logic**

Add optional `platform` parameter:

```typescript
export async function fetchSocialAccounts(
  config: ConfigSettings,
  limit: number,
  platform?: 'bluesky' | 'mastodon',
): Promise<IntelItem[]>
```

Wrap the Bluesky fetch block in `if (!platform || platform === 'bluesky')` and the Mastodon fetch block in `if (!platform || platform === 'mastodon')`. Tag items with `source: platform ?? 'accounts'`.

**Step 2: Update fetchSocialTopics the same way**

Add `platform?: 'bluesky' | 'mastodon'` param. Gate each platform block. Tag items with `source: platform ?? 'topics'`.

**Step 3: Update fetchSocialTrends the same way**

Add `platform?: 'bluesky' | 'mastodon'` param. Gate each platform block. Tag items with `source: platform ?? 'trends'`.

**Step 4: Commit**

```bash
git add frontend/src/lib/sensors/social_accounts.ts frontend/src/lib/sensors/social_topics.ts frontend/src/lib/sensors/social_trends.ts
git commit -m "feat(sensors): add platform filter param to social sensor functions"
```

---

### Task 5: Update sensor registry and pipeline orchestrator

**Files:**
- Modify: `frontend/src/lib/sensors/index.ts`
- Modify: `frontend/src/lib/pipeline/orchestrator.ts`

**Step 1: Replace social entries in SENSOR_REGISTRY**

Remove `social_accounts`, `social_topics`, `social_trends`, `x_posts` entries. Add platform-aware wrapper functions:

```typescript
import { fetchSocialAccounts } from './social_accounts'
import { fetchSocialTopics } from './social_topics'
import { fetchSocialTrends } from './social_trends'
import { fetchXPosts } from './x_posts'

// Platform wrapper — x just delegates to fetchXPosts
function fetchX(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  return fetchXPosts(config, limit)
}

// Bluesky: runs accounts + optionally topics + trends based on sub-toggles
async function fetchBluesky(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const items: IntelItem[] = []
  items.push(...await fetchSocialAccounts(config, limit, 'bluesky'))
  if (config.bluesky_topics_enabled) {
    items.push(...await fetchSocialTopics(config, limit, 'bluesky'))
  }
  if (config.bluesky_trends_enabled) {
    items.push(...await fetchSocialTrends(config, limit, 'bluesky'))
  }
  return items
}

// Mastodon: same pattern
async function fetchMastodon(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const items: IntelItem[] = []
  items.push(...await fetchSocialAccounts(config, limit, 'mastodon'))
  if (config.mastodon_topics_enabled) {
    items.push(...await fetchSocialTopics(config, limit, 'mastodon'))
  }
  if (config.mastodon_trends_enabled) {
    items.push(...await fetchSocialTrends(config, limit, 'mastodon'))
  }
  return items
}
```

Update the registry:

```typescript
export const SENSOR_REGISTRY: Record<string, SensorFetchFn> = {
  // ... other sensors unchanged ...
  x: fetchX,
  bluesky: fetchBluesky,
  mastodon: fetchMastodon,
}
```

**Step 2: No changes to orchestrator needed**

The orchestrator already uses `SENSOR_REGISTRY` keys dynamically and checks `config.sensors_enabled[name]`. With the new registry keys (`x`, `bluesky`, `mastodon`) and the updated `sensors_enabled` defaults, it works as-is.

**Step 3: Commit**

```bash
git add frontend/src/lib/sensors/index.ts
git commit -m "feat(sensors): platform-aware sensor registry with x/bluesky/mastodon entries"
```

---

### Task 6: Update lookback support constants

**Files:**
- Modify: `frontend/src/components/Sensors.tsx` (the `SENSOR_LOOKBACK_SUPPORT` constant)

**Step 1: Update lookback map**

Replace old social sensor entries:

```typescript
// Old: social_accounts: 48, social_topics: 48, social_trends: 24
// New:
x: 48,
bluesky: 48,
mastodon: 48,
```

**Step 2: Commit**

```bash
git add frontend/src/components/Sensors.tsx
git commit -m "feat(sensors): update lookback support for platform sensor keys"
```

---

### Task 7: Redesign Sensors.tsx — platform cards UI

**Files:**
- Modify: `frontend/src/components/Sensors.tsx`

**Step 1: Create platform card sub-components**

For the Social category, render platform cards instead of individual sensor rows. Each card:

- **X / Twitter**: Toggle + accounts TagInput + auth fields (twitter_auth_token, twitter_ct0)
- **Bluesky**: Toggle + accounts TagInput + "Include follows" checkbox + Topics checkbox + Trends checkbox + auth fields (bluesky_handle, bluesky_app_password)
- **Mastodon**: Toggle + accounts TagInput + "Include follows" checkbox + Topics checkbox + Trends checkbox + auth field (mastodon_token)
- **Topic Keywords**: Shared TagInput (only visible when any platform has Topics enabled)

Sub-checkboxes (Topics, Trends, Include follows) only visible when platform toggle is on.

**Step 2: Move auth fields into platform cards**

Currently the auth fields (twitter cookies, bluesky creds, mastodon token) are in the ApiKeys component. Move them inline into the respective platform cards so all platform config is co-located. Remove them from ApiKeys.

**Step 3: Wire save function**

The save function maps the platform UI state to config fields:
- `sensors_enabled.x` / `.bluesky` / `.mastodon` from platform toggles
- `bluesky_topics_enabled`, `bluesky_trends_enabled`, `mastodon_topics_enabled`, `mastodon_trends_enabled` from sub-checkboxes
- Account lists, following toggles, keywords, auth fields as before

**Step 4: Commit**

```bash
git add frontend/src/components/Sensors.tsx
git commit -m "feat(ui): redesign social settings as per-platform cards"
```

---

### Task 8: Update config masking for new fields

**Files:**
- Modify: `frontend/src/app/api/config/route.ts` (if new auth fields are exposed)
- Modify: `frontend/src/lib/config/index.ts` (maskConfig function if needed)

**Step 1: Verify masking**

Check that `twitter_auth_token`, `twitter_ct0`, `bluesky_app_password`, `mastodon_token` are still masked correctly. These fields didn't change names, so masking should still work. Verify and add any new fields if needed.

**Step 2: Commit (only if changes needed)**

```bash
git add frontend/src/lib/config/index.ts frontend/src/app/api/config/route.ts
git commit -m "fix(config): verify masking for social platform auth fields"
```

---

### Task 9: Update config tests

**Files:**
- Modify: `frontend/src/lib/config/index.test.ts`

**Step 1: Add migration tests**

Test that old config with `sensors_enabled.x_posts`, `social_accounts`, `social_topics`, `social_trends` migrates correctly to `x`, `bluesky`, `mastodon` plus per-platform sub-toggles.

**Step 2: Test default config**

Verify `defaultConfig()` has the new sensor keys and sub-toggle fields.

**Step 3: Run tests**

```bash
cd frontend && npx vitest run src/lib/config/index.test.ts
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add frontend/src/lib/config/index.test.ts
git commit -m "test(config): add migration tests for social platform model"
```

---

### Task 10: Update settings.local.yaml and add X accounts

**Files:**
- Modify: `config/settings.local.yaml`

**Step 1: Update sensor keys in YAML**

Replace old social sensor toggles with new platform keys:

```yaml
sensors_enabled:
  # ... other sensors ...
  x: true
  bluesky: true
  mastodon: true
  # Remove: x_posts, social_accounts, social_topics, social_trends

bluesky_topics_enabled: true
bluesky_trends_enabled: true
mastodon_topics_enabled: true
mastodon_trends_enabled: true
```

**Step 2: Add X accounts**

```yaml
social_accounts_x:
  - '@sama'
  - '@elonmusk'
  - '@peterthiel'
  - '@geoffreyhinton'
  - '@a16z'
  - '@deedydas'
  - '@vivekramaswami'
  - '@alexalbert__'
  - '@claudeai'
  - '@demishassabis'
  - '@DarioAmodei'
  - '@bcherny'
  - '@foundersfund'
  - '@sequoia'
  - '@benchmark'
  - '@Mayhem4Markets'
  - '@michaeljburry'
  - '@Thom_Wolf'
  - '@balajis'
  - '@alex_prompter'
  - '@AmandaAskell'
  - '@ShunyuYao14'
  - '@dwarkesh_sp'
  - '@SawyerMerritt'
  - '@gdb'
  - '@heyshrutimishra'
```

**Step 3: No commit needed (gitignored file)**

---

### Task 11: Update report builder and any remaining references

**Files:**
- Modify: `frontend/src/lib/pipeline/report-builder.ts` (if it references old sensor keys)
- Modify: `frontend/src/components/Data.tsx` (if it renders by sensor key)
- Modify: `frontend/src/components/Pipeline.tsx` (if it shows sensor names)

**Step 1: Search for old sensor key references**

Grep for `x_posts`, `social_accounts`, `social_topics`, `social_trends` across all `.ts` and `.tsx` files. Update any remaining hard-coded references to use the new keys.

**Step 2: Commit**

```bash
git add -A
git commit -m "fix: update remaining references to old social sensor keys"
```

---

### Task 12: Verification

**Step 1: Run all tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

**Step 2: Start dev server and verify UI**

```bash
make dev
```

Visit http://localhost:8000/sources — verify:
- Social category shows 3 platform cards (X, Bluesky, Mastodon)
- Each has its own toggle
- Bluesky/Mastodon show sub-checkboxes for Topics and Trends
- X shows accounts list and auth fields
- Topic Keywords section appears when Topics is enabled on any platform
- Save works correctly
- Status page shows platform-level entries

**Step 3: Test pipeline fetch**

Trigger a fetch via the UI or API and verify items come back tagged with `x`, `bluesky`, `mastodon` source keys.
