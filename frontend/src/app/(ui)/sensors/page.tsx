// ABOUTME: Redirect from old /sensors route to /sources.
// ABOUTME: Kept for backwards compatibility with bookmarks.
import { redirect } from 'next/navigation'

export default function SensorsRedirect() {
  redirect('/sources')
}
