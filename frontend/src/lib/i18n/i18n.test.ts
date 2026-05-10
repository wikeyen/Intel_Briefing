// ABOUTME: Tests for the i18n translation system — locale loading, key lookup, interpolation.
// ABOUTME: Validates both en and zh dictionaries have matching keys and correct fallback behavior.
import { describe, it, expect } from 'vitest'
import en from './locales/en'
import zh from './locales/zh'
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE } from './types'

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

  it('uses Info Aggregation product copy in supported locales', () => {
    expect(en['app.title']).toBe('Info Aggregation')
    expect(zh['app.title']).toBe('信息聚合')
    expect(en['dash.intelligence']).toBe('Insights')
    expect(zh['dash.intelligence']).toBe('洞察分析')
  })

  it('all required keys exist', () => {
    const requiredKeys = [
      'app.title',
      'nav.dashboard', 'nav.status', 'nav.feed',
      'ticker.updating', 'ticker.idle', 'ticker.items',
      'dash.exec_summary', 'dash.sentiment', 'dash.trending', 'dash.other',
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

