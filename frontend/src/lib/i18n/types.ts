// ABOUTME: Type definitions for the i18n translation system.
// ABOUTME: Flat dot-notation keys, locale registry, and helper types.

/** All supported locale codes. Add new locales here + create a matching locale file. */
export const SUPPORTED_LOCALES = ['en', 'zh'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
}

/** Default locale when none is configured. */
export const DEFAULT_LOCALE: Locale = 'zh'

/**
 * Flat translation dictionary — keys use dot notation (e.g. 'nav.dashboard').
 * Values are either plain strings or templates with {param} placeholders.
 */
export type TranslationDict = Record<string, string>
