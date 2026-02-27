// ABOUTME: Seeds 6 default source groups on first startup.
// ABOUTME: Called from initDb() when source_groups table is empty.

import { getDb } from '../db'
import { createGroup, setGroupMembers } from './queries'

interface DefaultGroup {
  name: string
  color: string
  trend_enabled?: boolean
  topic_enabled?: boolean
  social_enabled?: boolean
  sentiment_enabled?: boolean
  sensors: string[]
}

const DEFAULT_GROUPS: DefaultGroup[] = [
  {
    name: 'Research & Reports',
    color: '#1A7A6D',
    sensors: ['arxiv'],
  },
  {
    name: 'News',
    color: '#2E7D9A',
    sensors: ['hacker_news', 'product_hunt', 'sources_36kr', 'wallstreetcn', 'rss_news', 'github'],
  },
  {
    name: 'Trending',
    color: '#C4851C',
    trend_enabled: true,
    sensors: ['v2ex', 'zhihu', 'weibo', 'xiaohongshu', 'baidu_tieba', 'douyin', 'toutiao', 'netease', '36kr_trending', 'juejin', 'baidu', 'mastodon_trends'],
  },
  {
    name: 'Opinions',
    color: '#8B5CF6',
    sensors: ['hn_blogs', 'rss_blogs'],
  },
  {
    name: 'Voices',
    color: '#E05A8D',
    social_enabled: true,
    sentiment_enabled: true,
    sensors: ['x_accounts', 'bluesky_accounts', 'mastodon_accounts'],
  },
  {
    name: 'Topics',
    color: '#3B82F6',
    topic_enabled: true,
    sensors: ['bluesky_topics', 'mastodon_topics'],
  },
]

export async function seedDefaultGroups(): Promise<void> {
  const db = await getDb()
  const result = await db.execute('SELECT COUNT(*) as cnt FROM source_groups')
  const count = Number(result.rows[0].cnt)
  if (count > 0) return // already seeded

  for (let i = 0; i < DEFAULT_GROUPS.length; i++) {
    const def = DEFAULT_GROUPS[i]
    const group = await createGroup({
      name: def.name,
      color: def.color,
      trend_enabled: def.trend_enabled,
      topic_enabled: def.topic_enabled,
      social_enabled: def.social_enabled,
      sentiment_enabled: def.sentiment_enabled,
    })
    // Update sort_order since createGroup defaults to 0
    await db.execute({
      sql: 'UPDATE source_groups SET sort_order = ? WHERE id = ?',
      args: [i, group.id],
    })
    await setGroupMembers(group.id, def.sensors)
  }
}
