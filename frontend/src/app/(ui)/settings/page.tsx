// ABOUTME: Redirect from old /settings route to /sources.
// ABOUTME: Kept for backwards compatibility with bookmarks.
import { redirect } from 'next/navigation'

export default function SettingsRedirect() {
  redirect('/sources')
}
