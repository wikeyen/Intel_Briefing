// ABOUTME: Application configuration backed by SQLite with env-var fallback for tokens.
// ABOUTME: DB key 'intel:config' is the primary source — env vars fill in missing token fields.
import { kvSet, kvGet } from '../db'
import { type ConfigSettings, defaultConfig } from '../models'

const DB_KEY = 'intel:config'

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

/** Overlay process env vars for token fields when the config value is null/empty. */
function applyEnvFallback(config: ConfigSettings): ConfigSettings {
  return {
    ...config,
    xai_api_key:       config.xai_api_key      ?? process.env.XAI_API_KEY      ?? null,
    xai_base_url:      config.xai_base_url      || process.env.XAI_BASE_URL     || 'https://api.x.ai/v1/chat/completions',
    xai_model:         config.xai_model         || process.env.XAI_MODEL        || 'grok-3',
    github_token:      config.github_token      ?? process.env.GITHUB_TOKEN     ?? null,
    producthunt_token: config.producthunt_token  ?? process.env.PRODUCTHUNT_TOKEN ?? null,
  }
}

/** Load config from the database, falling back to defaults if key does not exist. */
export async function loadConfig(): Promise<ConfigSettings> {
  try {
    const data = await kvGet<ConfigSettings>(DB_KEY)
    if (!data) {
      return applyEnvFallback(defaultConfig())
    }
    // Merge stored values on top of defaults so new fields get default values
    return applyEnvFallback({ ...defaultConfig(), ...data })
  } catch {
    return applyEnvFallback(defaultConfig())
  }
}

/** Merge a partial config update into the database and return the full updated config. */
export async function saveConfig(
  partial: Partial<ConfigSettings>,
): Promise<ConfigSettings> {
  const current = await loadConfig()
  const merged = { ...current, ...partial }
  await kvSet(DB_KEY, merged)
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
