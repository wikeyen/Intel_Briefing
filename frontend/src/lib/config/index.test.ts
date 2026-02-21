// ABOUTME: Unit tests for config system in config/index.ts.
// ABOUTME: Covers loadConfig, saveConfig, maskConfig with mocked db and temp YAML files.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { defaultConfig, type ConfigSettings } from '../models'

// Stateful mock for the kv store — kvSet writes are visible to kvGet
let kvStore: Record<string, unknown> = {}
vi.mock('../db', () => ({
  kvSet: vi.fn(async (key: string, value: unknown) => { kvStore[key] = value }),
  kvGet: vi.fn(async (key: string) => kvStore[key] ?? null),
}))

const TEMP_DIR = path.resolve(__dirname, '__test_config__')
const TEMP_YAML = path.join(TEMP_DIR, 'test-settings.yaml')

beforeEach(async () => {
  vi.clearAllMocks()
  kvStore = {}
  // Point config to a non-existent temp file (no YAML layer by default)
  process.env.CONFIG_FILE_PATH = TEMP_YAML
  await mkdir(TEMP_DIR, { recursive: true })
  // Ensure no leftover file
  await unlink(TEMP_YAML).catch(() => {})
})

afterEach(async () => {
  await unlink(TEMP_YAML).catch(() => {})
  delete process.env.CONFIG_FILE_PATH
})

// Import after env is set (dynamic import honors the env at call time)
const { loadConfig, saveConfig, maskConfig } = await import('./index')

describe('loadConfig', () => {
  it('returns defaults when db and file have no data', async () => {
    const config = await loadConfig()
    expect(config.default_limit).toBe(10)
    expect(config.summary_api_key).toBeNull()
  })

  it('returns merged config from db', async () => {
    kvStore['intel:config'] = { default_limit: 42 }
    const config = await loadConfig()
    expect(config.default_limit).toBe(42)
  })

  it('settings from db override defaults', async () => {
    kvStore['intel:config'] = { default_limit: 5 }
    const config = await loadConfig()
    expect(config.default_limit).toBe(5)
  })

  it('YAML file overrides db values', async () => {
    kvStore['intel:config'] = { default_limit: 5, summary_model: 'old-model' }
    await writeFile(TEMP_YAML, 'default_limit: 99\nsummary_model: anthropic/claude-sonnet-4\n')
    const config = await loadConfig()
    expect(config.default_limit).toBe(99)
    expect(config.summary_model).toBe('anthropic/claude-sonnet-4')
  })

  it('db values used when YAML file missing', async () => {
    kvStore['intel:config'] = { default_limit: 42 }
    const config = await loadConfig()
    expect(config.default_limit).toBe(42)
  })
})

describe('saveConfig', () => {
  it('merges partial update and writes to db and file', async () => {
    const result = await saveConfig({ default_limit: 25 })
    expect(result.default_limit).toBe(25)
    expect(kvStore['intel:config']).toBeDefined()
  })

  it('preserves existing config fields', async () => {
    kvStore['intel:config'] = { summary_api_key: 'real-key', default_limit: 10 }
    const result = await saveConfig({ default_limit: 25 })
    expect(result.default_limit).toBe(25)
    expect(result.summary_api_key).toBe('real-key')
  })

  it('writes updated values to YAML file', async () => {
    await saveConfig({ summary_model: 'test-model' })
    const { loadConfig: freshLoad } = await import('./index')
    const config = await freshLoad()
    expect(config.summary_model).toBe('test-model')
  })
})

describe('maskConfig', () => {
  it('masks API key values with ***', () => {
    const config: ConfigSettings = {
      ...defaultConfig(),
      summary_api_key: 'secret-key',
      github_token: 'gh-token',
      producthunt_token: 'ph-token',
      bluesky_app_password: 'bsky-pass',
      mastodon_token: 'masto-token',
    }
    const masked = maskConfig(config)
    expect(masked.summary_api_key).toBe('***')
    expect(masked.github_token).toBe('***')
    expect(masked.producthunt_token).toBe('***')
    expect(masked.bluesky_app_password).toBe('***')
    expect(masked.mastodon_token).toBe('***')
  })

  it('does not mask null key values', () => {
    const config = defaultConfig()
    const masked = maskConfig(config)
    expect(masked.summary_api_key).toBeNull()
    expect(masked.github_token).toBeNull()
    expect(masked.bluesky_app_password).toBeNull()
    expect(masked.mastodon_token).toBeNull()
  })

  it('preserves non-key fields', () => {
    const config = { ...defaultConfig(), default_limit: 42 }
    const masked = maskConfig(config)
    expect(masked.default_limit).toBe(42)
  })
})

describe('config migration', () => {
  it('migrates politics_accounts to social_accounts_x', async () => {
    kvStore['intel:config'] = { politics_accounts: ['@potus', '@elonmusk'] }
    const config = await loadConfig()
    expect(config.social_accounts_x).toEqual(['@potus', '@elonmusk'])
  })

  it('migrates topics_keywords to social_topics_keywords', async () => {
    kvStore['intel:config'] = { topics_keywords: ['AI', 'crypto'] }
    const config = await loadConfig()
    expect(config.social_topics_keywords).toEqual(['AI', 'crypto'])
  })

  it('does not overwrite existing social fields with legacy keys', async () => {
    kvStore['intel:config'] = {
      politics_accounts: ['@old_user'],
      social_accounts_x: ['@new_user'],
    }
    const config = await loadConfig()
    expect(config.social_accounts_x).toEqual(['@new_user'])
  })

  it('migrates pipeline_concurrency to default_concurrency', async () => {
    kvStore['intel:config'] = { pipeline_concurrency: 8 }
    const config = await loadConfig()
    expect(config.default_concurrency).toBe(8)
  })

  it('migrates fetch_concurrency to default_concurrency', async () => {
    kvStore['intel:config'] = { fetch_concurrency: 6 }
    const config = await loadConfig()
    expect(config.default_concurrency).toBe(6)
  })

  it('migrates summary_concurrency to local_summary_concurrency', async () => {
    kvStore['intel:config'] = { summary_concurrency: 3 }
    const config = await loadConfig()
    expect(config.local_summary_concurrency).toBe(3)
  })

  it('does not overwrite existing concurrency fields with legacy key', async () => {
    kvStore['intel:config'] = { pipeline_concurrency: 8, default_concurrency: 3 }
    const config = await loadConfig()
    expect(config.default_concurrency).toBe(3)
  })

  it('migrates summary_provider custom to local', async () => {
    kvStore['intel:config'] = { summary_provider: 'custom' }
    const config = await loadConfig()
    expect(config.summary_provider).toBe('local')
  })

  it('applies migration to YAML file data too', async () => {
    await writeFile(TEMP_YAML, 'politics_accounts:\n  - "@potus"\n')
    const config = await loadConfig()
    expect(config.social_accounts_x).toEqual(['@potus'])
  })

  // --- Social platform model migrations ---

  it('migrates sensors_enabled.x_posts to sensors_enabled.x', async () => {
    kvStore['intel:config'] = { sensors_enabled: { x_posts: true } }
    const config = await loadConfig()
    expect(config.sensors_enabled.x).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('x_posts')
  })

  it('does not overwrite existing x with legacy x_posts', async () => {
    kvStore['intel:config'] = { sensors_enabled: { x_posts: true, x: false } }
    const config = await loadConfig()
    expect(config.sensors_enabled.x).toBe(false)
    expect(config.sensors_enabled).not.toHaveProperty('x_posts')
  })

  it('migrates sensors_enabled.social_accounts to bluesky + mastodon', async () => {
    kvStore['intel:config'] = { sensors_enabled: { social_accounts: true } }
    const config = await loadConfig()
    expect(config.sensors_enabled.bluesky).toBe(true)
    expect(config.sensors_enabled.mastodon).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('social_accounts')
  })

  it('does not overwrite existing bluesky/mastodon with legacy social_accounts', async () => {
    kvStore['intel:config'] = {
      sensors_enabled: { social_accounts: true, bluesky: false, mastodon: false },
    }
    const config = await loadConfig()
    expect(config.sensors_enabled.bluesky).toBe(false)
    expect(config.sensors_enabled.mastodon).toBe(false)
    expect(config.sensors_enabled).not.toHaveProperty('social_accounts')
  })

  it('migrates sensors_enabled.social_topics to per-platform topic toggles', async () => {
    kvStore['intel:config'] = { sensors_enabled: { social_topics: true } }
    const config = await loadConfig()
    expect(config.bluesky_topics_enabled).toBe(true)
    expect(config.mastodon_topics_enabled).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('social_topics')
  })

  it('migrates sensors_enabled.social_topics=false to disabled per-platform toggles', async () => {
    kvStore['intel:config'] = { sensors_enabled: { social_topics: false } }
    const config = await loadConfig()
    expect(config.bluesky_topics_enabled).toBe(false)
    expect(config.mastodon_topics_enabled).toBe(false)
  })

  it('does not overwrite existing topic toggles with legacy social_topics', async () => {
    kvStore['intel:config'] = {
      sensors_enabled: { social_topics: true },
      bluesky_topics_enabled: false,
      mastodon_topics_enabled: false,
    }
    const config = await loadConfig()
    expect(config.bluesky_topics_enabled).toBe(false)
    expect(config.mastodon_topics_enabled).toBe(false)
  })

  it('migrates sensors_enabled.social_trends to per-platform trend toggles', async () => {
    kvStore['intel:config'] = { sensors_enabled: { social_trends: true } }
    const config = await loadConfig()
    expect(config.bluesky_trends_enabled).toBe(true)
    expect(config.mastodon_trends_enabled).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('social_trends')
  })

  it('migrates sensors_enabled.social_trends=false to disabled per-platform toggles', async () => {
    kvStore['intel:config'] = { sensors_enabled: { social_trends: false } }
    const config = await loadConfig()
    expect(config.bluesky_trends_enabled).toBe(false)
    expect(config.mastodon_trends_enabled).toBe(false)
  })

  it('does not overwrite existing trend toggles with legacy social_trends', async () => {
    kvStore['intel:config'] = {
      sensors_enabled: { social_trends: true },
      bluesky_trends_enabled: false,
      mastodon_trends_enabled: false,
    }
    const config = await loadConfig()
    expect(config.bluesky_trends_enabled).toBe(false)
    expect(config.mastodon_trends_enabled).toBe(false)
  })

  it('migrates a full old-style config with all social legacy keys', async () => {
    kvStore['intel:config'] = {
      sensors_enabled: {
        hacker_news: true,
        x_posts: true,
        social_accounts: true,
        social_topics: false,
        social_trends: true,
      },
    }
    const config = await loadConfig()
    // x_posts → x
    expect(config.sensors_enabled.x).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('x_posts')
    // social_accounts → bluesky + mastodon
    expect(config.sensors_enabled.bluesky).toBe(true)
    expect(config.sensors_enabled.mastodon).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('social_accounts')
    // social_topics → per-platform booleans
    expect(config.bluesky_topics_enabled).toBe(false)
    expect(config.mastodon_topics_enabled).toBe(false)
    expect(config.sensors_enabled).not.toHaveProperty('social_topics')
    // social_trends → per-platform booleans
    expect(config.bluesky_trends_enabled).toBe(true)
    expect(config.mastodon_trends_enabled).toBe(true)
    expect(config.sensors_enabled).not.toHaveProperty('social_trends')
    // Existing sensor unaffected
    expect(config.sensors_enabled.hacker_news).toBe(true)
  })
})

describe('defaultConfig shape', () => {
  it('has new sensor keys x, bluesky, mastodon in sensors_enabled', () => {
    const cfg = defaultConfig()
    expect(cfg.sensors_enabled).toHaveProperty('x')
    expect(cfg.sensors_enabled).toHaveProperty('bluesky')
    expect(cfg.sensors_enabled).toHaveProperty('mastodon')
  })

  it('does not have old sensor keys x_posts, social_accounts, social_topics, social_trends', () => {
    const cfg = defaultConfig()
    expect(cfg.sensors_enabled).not.toHaveProperty('x_posts')
    expect(cfg.sensors_enabled).not.toHaveProperty('social_accounts')
    expect(cfg.sensors_enabled).not.toHaveProperty('social_topics')
    expect(cfg.sensors_enabled).not.toHaveProperty('social_trends')
  })

  it('has per-platform sub-toggle fields defaulting to true', () => {
    const cfg = defaultConfig()
    expect(cfg.bluesky_topics_enabled).toBe(true)
    expect(cfg.bluesky_trends_enabled).toBe(true)
    expect(cfg.mastodon_topics_enabled).toBe(true)
    expect(cfg.mastodon_trends_enabled).toBe(true)
  })

  it('has social_following toggles defaulting to false', () => {
    const cfg = defaultConfig()
    expect(cfg.social_following_bluesky).toBe(false)
    expect(cfg.social_following_mastodon).toBe(false)
  })

  it('has per-platform account arrays', () => {
    const cfg = defaultConfig()
    expect(cfg.social_accounts_x).toEqual([])
    expect(cfg.social_accounts_bluesky).toEqual([])
    expect(cfg.social_accounts_mastodon).toEqual([])
  })
})
