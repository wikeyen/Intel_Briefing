// ABOUTME: Application configuration with layered priority: env > YAML file > DB > defaults.
// ABOUTME: UI saves write to both SQLite and the YAML config file.
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'
import { kvSet, kvGet } from '../db'
import { type ConfigSettings, defaultConfig } from '../models'

const DB_KEY = 'intel:config'

// API endpoint constants
export const GITHUB_API_URL = 'https://api.github.com/graphql'

// Timeout constants (milliseconds)
export const DEFAULT_TIMEOUT = 15_000
export const RSS_FETCH_TIMEOUT = 10_000

// Content limit constants
export const CONTENT_TRUNCATE_LIMIT = 3000
export const MAX_BLOGS_TO_FETCH = 20
export const MAX_ARTICLES_PER_BLOG = 2

const KEY_FIELDS = new Set(['github_token', 'producthunt_token', 'bluesky_app_password', 'mastodon_token', 'summary_api_key'])

/** Resolve the path to the local YAML config file (lazy — reads env at call time). */
function configFilePath(): string {
  return process.env.CONFIG_FILE_PATH
    ?? path.resolve(process.cwd(), '..', 'config', 'settings.local.yaml')
}

/** Read config from the local YAML file. Returns null if file missing or invalid. */
async function readFileConfig(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(configFilePath(), 'utf-8')
    const data = yaml.load(raw)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/** Write a partial config update to the YAML file, merging with existing content. */
async function writeFileConfig(partial: Record<string, unknown>): Promise<void> {
  const filePath = configFilePath()
  const existing = await readFileConfig() ?? {}
  const merged = { ...existing, ...partial }
  await mkdir(path.dirname(filePath), { recursive: true })
  const header = [
    '# ABOUTME: Local config overrides — secrets and per-environment settings.',
    '# ABOUTME: Priority: env vars > this file > database > defaults.',
    '',
  ].join('\n')
  const content = header + yaml.dump(merged, { lineWidth: 120, noRefs: true, sortKeys: false })
  await writeFile(filePath, content, 'utf-8')
}

/** Apply environment variable overrides — env vars take highest priority. */
function applyEnvOverrides(config: ConfigSettings): ConfigSettings {
  const env = process.env
  return {
    ...config,
    github_token:         env.GITHUB_TOKEN         ?? config.github_token,
    producthunt_token:    env.PRODUCTHUNT_TOKEN    ?? config.producthunt_token,
    bluesky_handle:       env.BLUESKY_HANDLE       ?? config.bluesky_handle,
    bluesky_app_password: env.BLUESKY_APP_PASSWORD ?? config.bluesky_app_password,
    mastodon_token:       env.MASTODON_TOKEN       ?? config.mastodon_token,
    social_following_bluesky:  env.SOCIAL_FOLLOWING_BLUESKY !== undefined
      ? env.SOCIAL_FOLLOWING_BLUESKY === 'true'
      : config.social_following_bluesky,
    social_following_mastodon: env.SOCIAL_FOLLOWING_MASTODON !== undefined
      ? env.SOCIAL_FOLLOWING_MASTODON === 'true'
      : config.social_following_mastodon,
    rss_feed_urls: env.RSS_FEED_URLS
      ? env.RSS_FEED_URLS.split(',').map(u => u.trim()).filter(Boolean)
      : config.rss_feed_urls,
    summary_api_key:  env.SUMMARY_API_KEY  ?? config.summary_api_key,
    summary_base_url: env.SUMMARY_BASE_URL || config.summary_base_url,
    summary_model:    env.SUMMARY_MODEL    || config.summary_model,
  }
}

/** Migrate legacy config keys to current field names. */
function migrateConfig(data: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...data }
  // politics_accounts → social_accounts_x
  if ('politics_accounts' in migrated && !('social_accounts_x' in migrated)) {
    migrated.social_accounts_x = migrated.politics_accounts
  }
  delete migrated.politics_accounts
  // topics_keywords → social_topics_keywords
  if ('topics_keywords' in migrated && !('social_topics_keywords' in migrated)) {
    migrated.social_topics_keywords = migrated.topics_keywords
  }
  delete migrated.topics_keywords
  // pipeline_concurrency → default_concurrency (legacy two-hop)
  if ('pipeline_concurrency' in migrated) {
    const val = migrated.pipeline_concurrency as number
    if (!('default_concurrency' in migrated)) migrated.default_concurrency = val
    delete migrated.pipeline_concurrency
  }
  // fetch_concurrency → default_concurrency
  if ('fetch_concurrency' in migrated && !('default_concurrency' in migrated)) {
    migrated.default_concurrency = migrated.fetch_concurrency
  }
  delete migrated.fetch_concurrency
  // summary_concurrency → local_summary_concurrency
  if ('summary_concurrency' in migrated && !('local_summary_concurrency' in migrated)) {
    migrated.local_summary_concurrency = migrated.summary_concurrency
  }
  delete migrated.summary_concurrency
  // summary_provider: 'custom' → 'local'
  if (migrated.summary_provider === 'custom') {
    migrated.summary_provider = 'local'
  }
  return migrated
}

/**
 * Load config with priority: env vars > YAML file > database > defaults.
 * Each layer overrides the previous one via shallow merge.
 */
export async function loadConfig(): Promise<ConfigSettings> {
  let config = defaultConfig()

  // Layer 1 (lowest): Database
  try {
    const dbData = await kvGet<ConfigSettings>(DB_KEY)
    if (dbData) {
      const migrated = migrateConfig(dbData as unknown as Record<string, unknown>)
      config = { ...config, ...migrated } as ConfigSettings
    }
  } catch { /* continue with defaults */ }

  // Layer 2: YAML config file (overrides DB)
  const fileData = await readFileConfig()
  if (fileData) {
    const migrated = migrateConfig(fileData)
    config = { ...config, ...migrated } as ConfigSettings
  }

  // Layer 3 (highest): Environment variables
  config = applyEnvOverrides(config)

  return config
}

/**
 * Merge a partial config update into both the database and the YAML file.
 * Returns the full updated config after re-loading with the priority chain.
 */
export async function saveConfig(
  partial: Partial<ConfigSettings>,
): Promise<ConfigSettings> {
  // Write to DB
  const dbData = await kvGet<ConfigSettings>(DB_KEY).catch(() => null)
  const dbBase = dbData ? { ...defaultConfig(), ...dbData } : defaultConfig()
  const merged = { ...dbBase, ...partial }
  await kvSet(DB_KEY, merged)

  // Also write to YAML file (merge only the changed fields)
  await writeFileConfig(partial as Record<string, unknown>).catch((err) => {
    console.error('Failed to write config file:', err)
  })

  // Return the full config with priority chain applied
  return loadConfig()
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
