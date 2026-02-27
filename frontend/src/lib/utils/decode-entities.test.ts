// ABOUTME: Tests for the HTML entity decoder utility.
// ABOUTME: Validates numeric, hex, and named entity decoding across IntelItem text fields.
import { describe, it, expect } from 'vitest'
import { decodeItemEntities } from './decode-entities'

describe('decodeItemEntities', () => {
  it('does not modify non-string fields', () => {
    const item = { title: 'Clean title', id: 123, url: null, heat: undefined }
    decodeItemEntities(item as Record<string, unknown>)
    expect(item.title).toBe('Clean title')
    expect(item.id).toBe(123)
    expect(item.url).toBeNull()
  })

  it('decodes all text fields on an IntelItem', () => {
    const item = {
      title: '&#39;Title&#39;',
      abstract: '&#39;Abstract&#39;',
      content: '&#39;Content&#39;',
      heat: '&#39;Heat&#39;',
      topic: '&#39;Topic&#39;',
      account: '&#39;Account&#39;',
      handle: '&#39;Handle&#39;',
    }
    decodeItemEntities(item)
    expect(item.title).toBe("'Title'")
    expect(item.abstract).toBe("'Abstract'")
    expect(item.content).toBe("'Content'")
    expect(item.heat).toBe("'Heat'")
    expect(item.topic).toBe("'Topic'")
    expect(item.account).toBe("'Account'")
    expect(item.handle).toBe("'Handle'")
  })
})
