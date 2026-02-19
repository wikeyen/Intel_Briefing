// ABOUTME: Tests for the HTML entity decoder utility.
// ABOUTME: Validates numeric, hex, and named entity decoding across IntelItem text fields.
import { describe, it, expect } from 'vitest'
import { decodeItemEntities } from './decode-entities'

describe('decodeItemEntities', () => {
  it('decodes numeric entities like &#39;', () => {
    const item = { title: "It&#39;s a test", content: '100&#37; done' }
    decodeItemEntities(item)
    expect(item.title).toBe("It's a test")
    expect(item.content).toBe('100% done')
  })

  it('decodes hex entities like &#x27;', () => {
    const item = { title: 'A &#x26; B', abstract: '&#x201C;quoted&#x201D;' }
    decodeItemEntities(item)
    expect(item.title).toBe('A & B')
    expect(item.abstract).toBe('\u201Cquoted\u201D')
  })

  it('decodes named entities', () => {
    const item = { title: '&amp; &lt; &gt; &quot; &apos;', abstract: '&ndash; &mdash; &hellip;' }
    decodeItemEntities(item)
    expect(item.title).toBe("& < > \" '")
    expect(item.abstract).toBe('\u2013 \u2014 \u2026')
  })

  it('handles mixed entities in one string', () => {
    const item = { title: 'O&#39;Brien &amp; partners &mdash; 100&#37;' }
    decodeItemEntities(item)
    expect(item.title).toBe("O'Brien & partners \u2014 100%")
  })

  it('does not modify non-string fields', () => {
    const item = { title: 'Clean title', id: 123, url: null, heat: undefined }
    decodeItemEntities(item as Record<string, unknown>)
    expect(item.title).toBe('Clean title')
    expect(item.id).toBe(123)
    expect(item.url).toBeNull()
  })

  it('leaves strings without entities unchanged', () => {
    const item = { title: 'Normal title', content: 'Just text' }
    decodeItemEntities(item)
    expect(item.title).toBe('Normal title')
    expect(item.content).toBe('Just text')
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
