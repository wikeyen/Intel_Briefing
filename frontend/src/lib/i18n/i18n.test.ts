// ABOUTME: Tests for the i18n translation system — locale loading, key lookup, interpolation.
// ABOUTME: Validates both en and zh dictionaries have matching keys and correct fallback behavior.
import { describe, it, expect } from 'vitest'
import en from './locales/en'
import zh from './locales/zh'
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE } from './types'
import type { Locale, TranslationDict } from './types'

describe('i18n locale configuration', () => {
  it('SUPPORTED_LOCALES includes en and zh', () => {
    expect(SUPPORTED_LOCALES).toContain('en')
    expect(SUPPORTED_LOCALES).toContain('zh')
  })

  it('LOCALE_LABELS has a label for each supported locale', () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(LOCALE_LABELS[loc]).toBeTruthy()
    }
  })

  it('DEFAULT_LOCALE is a supported locale', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE)
  })
})

describe('i18n locale dictionaries', () => {
  const enKeys = Object.keys(en).sort()
  const zhKeys = Object.keys(zh).sort()

  it('en and zh have the same keys', () => {
    const enOnly = enKeys.filter(k => !zhKeys.includes(k))
    const zhOnly = zhKeys.filter(k => !enKeys.includes(k))

    expect(enOnly).toEqual([])
    expect(zhOnly).toEqual([])
  })

  it('no empty values in en locale', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en key "${key}" is empty`).toBeTruthy()
    }
  })

  it('no empty values in zh locale', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value, `zh key "${key}" is empty`).toBeTruthy()
    }
  })

  it('placeholder params match between en and zh', () => {
    const paramRegex = /\{(\w+)\}/g

    for (const key of enKeys) {
      const enParams = [...en[key].matchAll(paramRegex)].map(m => m[1]).sort()
      const zhParams = [...zh[key].matchAll(paramRegex)].map(m => m[1]).sort()

      expect(zhParams, `Key "${key}": zh params ${JSON.stringify(zhParams)} != en params ${JSON.stringify(enParams)}`).toEqual(enParams)
    }
  })

  it('all required keys exist', () => {
    const requiredKeys = [
      'app.title',
      'nav.dashboard', 'nav.status', 'nav.feed',
      'ticker.updating', 'ticker.idle', 'ticker.items',
      'dash.exec_summary', 'dash.sentiment', 'dash.trending',
      'domain.macro', 'domain.news', 'domain.social',
      'sentiment.bullish', 'sentiment.bearish', 'sentiment.mixed', 'sentiment.neutral',
      'sidebar.language',
      'time.seconds_ago', 'time.minutes_ago', 'time.hours_ago', 'time.days_ago',
    ]

    for (const key of requiredKeys) {
      expect(en[key], `Missing en key: ${key}`).toBeTruthy()
      expect(zh[key], `Missing zh key: ${key}`).toBeTruthy()
    }
  })
})

describe('t() interpolation logic', () => {
  // Replicate the t() function logic from context.tsx
  function t(dict: TranslationDict, key: string, params?: Record<string, string | number>): string {
    let value = dict[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return value
  }

  it('returns the value for a known key', () => {
    expect(t(en, 'app.title')).toBe('Intel Briefing')
    expect(t(zh, 'app.title')).toBe('情报简报')
  })

  it('returns the key itself for an unknown key', () => {
    expect(t(en, 'nonexistent.key')).toBe('nonexistent.key')
  })

  it('interpolates single param', () => {
    expect(t(en, 'ticker.items', { count: 42 })).toBe('42 items')
    expect(t(zh, 'ticker.items', { count: 42 })).toBe('42 条')
  })

  it('interpolates time params', () => {
    expect(t(en, 'time.minutes_ago', { n: 5 })).toBe('5m ago')
    expect(t(zh, 'time.minutes_ago', { n: 5 })).toBe('5分钟前')
  })

  it('interpolates multiple params', () => {
    expect(t(en, 'ticker.fetched_ago', { time: '5m ago' })).toBe('Fetched 5m ago')
    expect(t(zh, 'ticker.fetched_ago', { time: '5分钟前' })).toBe('获取于 5分钟前')
  })

  it('handles params with no placeholders gracefully', () => {
    expect(t(en, 'app.title', { unused: 'param' })).toBe('Intel Briefing')
  })
})
