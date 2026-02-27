// ABOUTME: Sensor display helpers — hidden sensors and lookback support defaults.
// ABOUTME: Lightweight constants used by the Sources page and sensor configuration UI.

/** Sensors that should be hidden from the sources page (controlled implicitly). */
export const HIDDEN_SENSORS = new Set(['rss_news'])

/** Sensors that support lookback hours, with defaults. */
export const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  x_accounts: 48,
  bluesky_accounts: 48,
  bluesky_topics: 48,
  mastodon_accounts: 48,
  mastodon_topics: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
  rss_blogs: 72,
  rss_news: 72,
}
