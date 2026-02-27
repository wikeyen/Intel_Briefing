// ABOUTME: Type smoke tests — verifies group type definitions compile and satisfy constraints.
// ABOUTME: Ensures GroupProcessing covers all expected values and SourceGroupTree nests correctly.
import { describe, it, expect } from 'vitest'
import type { GroupProcessing, SourceGroup, SourceGroupFlat, SourceGroupTree, CreateGroupPayload } from '../types'

describe('group types', () => {
  it('GroupProcessing accepts all expected values', () => {
    const values: GroupProcessing[] = ['trend', 'topic', 'social', 'research', 'news', 'opinion', 'general']
    expect(values).toHaveLength(7)
  })

  it('SourceGroupTree supports nesting', () => {
    const child: SourceGroupTree = {
      id: 'child-1', parent_id: 'parent-1', name: 'CN Trending',
      color: '#C4851C', icon: null, processing: 'trend', sort_order: 0,
      created_at: '', updated_at: '', sensors: ['weibo'], children: [],
    }
    const parent: SourceGroupTree = {
      id: 'parent-1', parent_id: null, name: 'Trending',
      color: '#C4851C', icon: null, processing: 'trend', sort_order: 0,
      created_at: '', updated_at: '', sensors: ['github'], children: [child],
    }
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0].parent_id).toBe(parent.id)
  })

  it('SourceGroup has all expected fields', () => {
    const group: SourceGroup = {
      id: 'test-1', parent_id: null, name: 'Test',
      color: '#000000', icon: 'star', processing: 'general', sort_order: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    expect(group.id).toBe('test-1')
    expect(group.icon).toBe('star')
  })

  it('SourceGroupFlat extends SourceGroup with sensors', () => {
    const flat: SourceGroupFlat = {
      id: 'flat-1', parent_id: null, name: 'Flat',
      color: '#FF0000', icon: null, processing: 'news', sort_order: 1,
      created_at: '', updated_at: '', sensors: ['hacker_news', 'rss_news'],
    }
    expect(flat.sensors).toHaveLength(2)
    expect(flat.processing).toBe('news')
  })

  it('CreateGroupPayload requires only name and color', () => {
    const minimal: CreateGroupPayload = { name: 'Test', color: '#000000' }
    expect(minimal.name).toBe('Test')
    expect(minimal.processing).toBeUndefined()
    expect(minimal.parent_id).toBeUndefined()

    const full: CreateGroupPayload = {
      name: 'Full', color: '#111111', icon: 'globe',
      processing: 'trend', parent_id: 'parent-1',
    }
    expect(full.processing).toBe('trend')
  })
})
