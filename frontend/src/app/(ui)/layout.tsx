// ABOUTME: Server-side UI layout — reads locale cookie to prevent language flash on refresh.
// ABOUTME: Passes initialLocale to client shell so first render uses the correct language.
import { cookies } from 'next/headers'
import { UiLayoutClient } from './UiLayoutClient'
import type { Locale } from '@/lib/i18n/types'
import { SUPPORTED_LOCALES } from '@/lib/i18n/types'

export default async function UiLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const raw = cookieStore.get('intel-locale')?.value
  const initialLocale: Locale | undefined =
    raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)
      ? (raw as Locale)
      : undefined

  return <UiLayoutClient initialLocale={initialLocale}>{children}</UiLayoutClient>
}
