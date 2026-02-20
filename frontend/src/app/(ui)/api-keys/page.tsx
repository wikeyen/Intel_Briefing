// ABOUTME: Redirect from old /api-keys route to /connections.
// ABOUTME: Kept for backwards compatibility with bookmarks.
import { redirect } from 'next/navigation'

export default function ApiKeysRedirect() {
  redirect('/connections')
}
