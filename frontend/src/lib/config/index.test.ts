// ABOUTME: Unit tests for config system in config/index.ts.
// ABOUTME: Covers loadConfig, saveConfig, maskConfig with mocked Redis.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultConfig, type ConfigSettings } from '../models'

// Mock @upstash/redis
const mockSet = vi.fn()
const mockGet = vi.fn()
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
  })),
}))

const { loadConfig, saveConfig, maskConfig } = await import('./index')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadConfig', () => {
  it('returns defaults when Redis has no data', async () => {
    mockGet.mockResolvedValue(null)
    const config = await loadConfig()
    expect(config.default_limit).toBe(10)
    expect(config.xai_api_key).toBeNull()
    expect(config.xai_base_url).toBe('https://api.x.ai/v1/chat/completions')
  })

  it('returns merged config from Redis', async () => {
    mockGet.mockResolvedValue({ default_limit: 42 })
    const config = await loadConfig()
    expect(config.default_limit).toBe(42)
    // Other fields should still have defaults
    expect(config.xai_model).toBe('grok-3')
  })

  it('returns defaults on Redis error', async () => {
    mockGet.mockRejectedValue(new Error('connection failed'))
    const config = await loadConfig()
    expect(config.default_limit).toBe(10)
  })

  it('settings from Redis override defaults', async () => {
    mockGet.mockResolvedValue({ default_limit: 5 })
    const config = await loadConfig()
    expect(config.default_limit).toBe(5)
  })
})

describe('saveConfig', () => {
  it('merges partial update and writes to Redis', async () => {
    mockGet.mockResolvedValue(null)
    const result = await saveConfig({ default_limit: 25 })
    expect(result.default_limit).toBe(25)
    expect(mockSet).toHaveBeenCalled()
  })

  it('preserves existing config fields', async () => {
    mockGet.mockResolvedValue({ xai_api_key: 'real-key', default_limit: 10 })
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
