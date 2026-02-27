// ABOUTME: TypeScript types for source groups — the user-defined sensor classification system.
// ABOUTME: Groups are persisted in SQLite and drive intelligence analysis, Data page tabs, and Sources page layout.

/** Processing pipeline hint — determines what intelligence analysis runs on a group's data. */
export type GroupProcessing = 'trend' | 'topic' | 'social' | 'research' | 'news' | 'opinion' | 'general'

/** A source group as stored in the database. */
export interface SourceGroup {
  id: string
  parent_id: string | null
  name: string
  color: string
  icon: string | null
  processing: GroupProcessing
  sort_order: number
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
  processing?: GroupProcessing
  parent_id?: string | null
}

/** Payload for updating an existing group. */
export interface UpdateGroupPayload {
  name?: string
  color?: string
  icon?: string | null
  processing?: GroupProcessing
}
