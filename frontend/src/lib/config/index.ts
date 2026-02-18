// ABOUTME: Application configuration backed by Upstash Redis.
// ABOUTME: Redis key 'intel:config' is the single source of truth — env vars are not used for config values.
import { Redis } from '@upstash/redis'
import { type ConfigSettings, defaultConfig } from '../models'

const REDIS_KEY = 'intel:config'

// API endpoint constants
export const GITHUB_API_URL = 'https://api.github.com/graphql'

// Timeout constants (milliseconds)
export const DEFAULT_TIMEOUT = 15_000
export const GROK_TIMEOUT = 60_000
export const RSS_FETCH_TIMEOUT = 10_000

// Content limit constants
export const CONTENT_TRUNCATE_LIMIT = 3000
export const MAX_BLOGS_TO_FETCH = 20
export const MAX_ARTICLES_PER_BLOG = 2

const KEY_FIELDS = new Set(['xai_api_key', 'github_token', 'producthunt_token'])

function getRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

/** Load config from Redis, falling back to defaults if key does not exist. */
export async function loadConfig(): Promise<ConfigSettings> {
  try {
    const redis = getRedis()
    const data = await redis.get<ConfigSettings>(REDIS_KEY)
    if (!data) {
      return defaultConfig()
    }
    // Merge stored values on top of defaults so new fields get default values
    return { ...defaultConfig(), ...data }
  } catch {
    return defaultConfig()
  }
}

/** Merge a partial config update into Redis and return the full updated config. */
export async function saveConfig(
  partial: Partial<ConfigSettings>,
): Promise<ConfigSettings> {
  const current = await loadConfig()
  const merged = { ...current, ...partial }
  const redis = getRedis()
  await redis.set(REDIS_KEY, merged)
  return merged
}

/** Return a copy of the config with API key values replaced by '***'. */
export function maskConfig(
  config: ConfigSettings,
): ConfigSettings {
  const masked = { ...config }
  for (const field of KEY_FIELDS) {
    const key = field as keyof ConfigSettings
    if (masked[key]) {
      ;(masked as Record<string, unknown>)[key] = '***'
    }
  }
  return masked
}
