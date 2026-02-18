// ABOUTME: Unit tests for config system in config/index.ts.
// ABOUTME: Covers loadConfig, saveConfig, maskConfig with mocked db adapter.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultConfig, type ConfigSettings } from '../models'

// Mock the db adapter
const mockKvSet = vi.fn()
const mockKvGet = vi.fn()
vi.mock('../db', () => ({
  kvSet: (...args: unknown[]) => mockKvSet(...args),
  kvGet: (...args: unknown[]) => mockKvGet(...args),
}))

const { loadConfig, saveConfig, maskConfig } = await import('./index')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadConfig', () => {
  it('returns defaults when db has no data', async () => {
    mockKvGet.mockResolvedValue(null)
    const config = await loadConfig()
    expect(config.default_limit).toBe(10)
    expect(config.xai_api_key).toBeNull()
    expect(config.xai_base_url).toBe('https://api.x.ai/v1/chat/completions')
  })

  it('returns merged config from db', async () => {
    mockKvGet.mockResolvedValue({ default_limit: 42 })
    const config = await loadConfig()
    expect(config.default_limit).toBe(42)
    // Other fields should still have defaults
    expect(config.xai_model).toBe('grok-3')
  })

  it('returns defaults on db error', async () => {
    mockKvGet.mockRejectedValue(new Error('db error'))
    const config = await loadConfig()
    expect(config.default_limit).toBe(10)
  })

  it('settings from db override defaults', async () => {
    mockKvGet.mockResolvedValue({ default_limit: 5 })
    const config = await loadConfig()
    expect(config.default_limit).toBe(5)
  })
})

describe('saveConfig', () => {
  it('merges partial update and writes to db', async () => {
    mockKvGet.mockResolvedValue(null)
    const result = await saveConfig({ default_limit: 25 })
    expect(result.default_limit).toBe(25)
    expect(mockKvSet).toHaveBeenCalled()
  })

  it('preserves existing config fields', async () => {
    mockKvGet.mockResolvedValue({ xai_api_key: 'real-key', default_limit: 10 })
    const result = await saveConfig({ default_limit: 25 })
    expect(result.default_limit).toBe(25)
    expect(result.xai_api_key).toBe('real-key')
  })
})

describe('maskConfig', () => {
  it('masks API key values with ***', () => {
    const config: ConfigSettings = {
      ...defaultConfig(),
      xai_api_key: 'secret-key',
      github_token: 'gh-token',
      producthunt_token: 'ph-token',
    }
    const masked = maskConfig(config)
    expect(masked.xai_api_key).toBe('***')
    expect(masked.github_token).toBe('***')
    expect(masked.producthunt_token).toBe('***')
  })

  it('does not mask null key values', () => {
    const config = defaultConfig()
    const masked = maskConfig(config)
    expect(masked.xai_api_key).toBeNull()
    expect(masked.github_token).toBeNull()
  })

  it('preserves non-key fields', () => {
    const config = { ...defaultConfig(), default_limit: 42 }
    const masked = maskConfig(config)
    expect(masked.default_limit).toBe(42)
  })
})

describe('constants', () => {
  it('exports GITHUB_API_URL as https', async () => {
    const { GITHUB_API_URL } = await import('./index')
    expect(GITHUB_API_URL).toMatch(/^https:\/\//)
  })
})
