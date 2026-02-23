// ABOUTME: Public API for the i18n translation system.
// ABOUTME: Re-exports context, types, and locale constants for convenient imports.
export { I18nProvider, useTranslation, toLocale } from './context'
export { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE } from './types'
export type { Locale, TranslationDict } from './types'
