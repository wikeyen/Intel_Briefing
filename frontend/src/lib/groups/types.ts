// ABOUTME: TypeScript types for source groups — the user-defined sensor classification system.
// ABOUTME: Groups are persisted in SQLite and drive intelligence analysis, Data page tabs, and Sources page layout.

/** A source group as stored in the database. */
export interface SourceGroup {
  id: string
  parent_id: string | null
  name: string
  color: string
  icon: string | null
  sort_order: number
  trend_enabled: boolean
  topic_enabled: boolean
  social_enabled: boolean
  sentiment_enabled: boolean
  summary_prompt: string | null
  trend_prompt: string | null
  topic_prompt: string | null
  social_prompt: string | null
  suppress_keywords: string[]
  boost_keywords: string[]
  created_at: string
  updated_at: string
}

/** A group with its member sensor keys (flat, for pipeline use). */
export interface SourceGroupFlat extends SourceGroup {
  sensors: string[]
}

/** A group with children and sensors (tree, for UI use). */
export interface SourceGroupTree extends SourceGroup {
  sensors: string[]
  children: SourceGroupTree[]
}

/** Payload for creating a new group. */
export interface CreateGroupPayload {
  name: string
  color: string
  icon?: string | null
  parent_id?: string | null
  trend_enabled?: boolean
  topic_enabled?: boolean
  social_enabled?: boolean
  sentiment_enabled?: boolean
  summary_prompt?: string | null
  trend_prompt?: string | null
  topic_prompt?: string | null
  social_prompt?: string | null
  suppress_keywords?: string[]
  boost_keywords?: string[]
}

/** Payload for updating an existing group. */
export interface UpdateGroupPayload {
  name?: string
  color?: string
  icon?: string | null
  trend_enabled?: boolean
  topic_enabled?: boolean
  social_enabled?: boolean
  sentiment_enabled?: boolean
  summary_prompt?: string | null
  trend_prompt?: string | null
  topic_prompt?: string | null
  social_prompt?: string | null
  suppress_keywords?: string[]
  boost_keywords?: string[]
}
