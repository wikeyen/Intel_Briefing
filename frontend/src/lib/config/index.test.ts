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
    expect(config.xai_api_key).toBeNull()
    expect(config.xai_base_url).toBe('https://api.x.ai/v1/chat/completions')
  })

  it('returns merged config from db', async () => {
    kvStore['intel:config'] = { default_limit: 42 }
    const config = await loadConfig()
    expect(config.default_limit).toBe(42)
    expect(config.xai_model).toBe('grok-3')
  })

  it('settings from db override defaults', async () => {
    kvStore['intel:config'] = { default_limit: 5 }
    const config = await loadConfig()
    expect(config.default_limit).toBe(5)
  })

  it('YAML file overrides db values', async () => {
    kvStore['intel:config'] = { default_limit: 5, xai_model: 'grok-2' }
    await writeFile(TEMP_YAML, 'default_limit: 99\nxai_model: grok-3\n')
    const config = await loadConfig()
    expect(config.default_limit).toBe(99)
    expect(config.xai_model).toBe('grok-3')
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
    kvStore['intel:config'] = { xai_api_key: 'real-key', default_limit: 10 }
    const result = await saveConfig({ default_limit: 25 })
    expect(result.default_limit).toBe(25)
    expect(result.xai_api_key).toBe('real-key')
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
      xai_api_key: 'secret-key',
      github_token: 'gh-token',
      producthunt_token: 'ph-token',
      bluesky_app_password: 'bsky-pass',
      mastodon_token: 'masto-token',
    }
    const masked = maskConfig(config)
    expect(masked.xai_api_key).toBe('***')
    expect(masked.github_token).toBe('***')
    expect(masked.producthunt_token).toBe('***')
    expect(masked.bluesky_app_password).toBe('***')
    expect(masked.mastodon_token).toBe('***')
  })

  it('does not mask null key values', () => {
    const config = defaultConfig()
    const masked = maskConfig(config)
    expect(masked.xai_api_key).toBeNull()
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
})
