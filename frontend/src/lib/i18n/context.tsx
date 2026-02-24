// ABOUTME: React context and provider for the i18n translation system.
// ABOUTME: Provides useTranslation() hook with t() function and locale state.
'use client'
import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Locale, TranslationDict } from './types'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './types'
import en from './locales/en'
import zh from './locales/zh'

/** Registry of all loaded locale dictionaries. */
const DICTIONARIES: Record<Locale, TranslationDict> = { en, zh }

export interface I18nContextValue {
  /** Current active locale. */
  locale: Locale
  /** Translate a key, optionally interpolating {param} placeholders. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** Switch locale — persists to config API. */
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * Interpolate {param} placeholders in a translation string.
 * E.g. t('ticker.items', { count: 42 }) → "42 items"
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key]
    return val != null ? String(val) : `{${key}}`
  })
}

/** Validate and coerce a string to a supported Locale, falling back to DEFAULT_LOCALE. */
export function toLocale(value: string | null | undefined): Locale {
  if (value && (SUPPORTED_LOCALES as readonly string[]).includes(value)) return value as Locale
  return DEFAULT_LOCALE
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE)

  // On mount, fetch the configured language from the API
  useEffect(() => {
    if (initialLocale) return
    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then(config => {
        if (config?.summary_language) {
          const l = toLocale(config.summary_language)
          setLocaleState(l)
          // Sync cookie for instant SSR on next page load
          document.cookie = `intel-locale=${l};path=/;max-age=31536000;samesite=lax`
        }
      })
      .catch(() => {})
  }, [initialLocale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    // Persist to cookie for instant SSR on next page load
    document.cookie = `intel-locale=${next};path=/;max-age=31536000;samesite=lax`
    // Persist to config API — fire and forget
    fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary_language: next }),
    }).catch(() => {})
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
    const template = dict[key]
    if (!template) return key // Fallback: return the key itself
    return interpolate(template, params)
  }, [locale])

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Access the i18n context — returns { locale, t, setLocale }.
 * Must be used inside an I18nProvider.
 */
export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useTranslation must be used inside I18nProvider')
  return ctx
}
