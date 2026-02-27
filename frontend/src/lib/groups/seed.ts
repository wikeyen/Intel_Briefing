// ABOUTME: Seeds 5 default source groups on first startup.
// ABOUTME: Called from initDb() when source_groups table is empty.

import { getDb } from '../db'
import { createGroup, setGroupMembers } from './queries'
import type { GroupProcessing } from './types'

interface DefaultGroup {
  name: string
  color: string
  processing: GroupProcessing
  sensors: string[]
}

const DEFAULT_GROUPS: DefaultGroup[] = [
  {
    name: 'Research & Reports',
    color: '#1A7A6D',
    processing: 'research',
    sensors: ['arxiv'],
  },
  {
    name: 'News',
    color: '#2E7D9A',
    processing: 'news',
    sensors: ['hacker_news', 'product_hunt', 'chrome_radar', 'sources_36kr', 'wallstreetcn', 'rss_news', 'github'],
  },
  {
    name: 'Trending',
    color: '#C4851C',
    processing: 'trend',
    sensors: ['v2ex', 'zhihu', 'weibo', 'xiaohongshu', 'baidu_tieba', 'douyin', 'toutiao', 'netease', '36kr_trending', 'juejin', 'baidu', 'mastodon_trends'],
  },
  {
    name: 'Opinions',
    color: '#7E6B9A',
    processing: 'opinion',
    sensors: ['hn_blogs', 'rss_feeds'],
  },
  {
    name: 'Topics',
    color: '#3D9E85',
    processing: 'topic',
    sensors: ['x', 'bluesky', 'mastodon'],
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
      processing: def.processing,
    })
    // Update sort_order since createGroup defaults to 0
    await db.execute({
      sql: 'UPDATE source_groups SET sort_order = ? WHERE id = ?',
      args: [i, group.id],
    })
    await setGroupMembers(group.id, def.sensors)
  }
}
