// ABOUTME: Sensor display helpers — hidden sensors and lookback support defaults.
// ABOUTME: Lightweight constants used by the Sources page and sensor configuration UI.

/** Sensors that should be hidden from the sources page (controlled implicitly). */
export const HIDDEN_SENSORS = new Set(['rss_news'])

/** Sensors that support lookback hours, with defaults. */
export const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  x: 48,
  bluesky: 48,
  mastodon: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
  rss_feeds: 72,
}
