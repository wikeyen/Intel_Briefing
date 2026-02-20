// ABOUTME: Console page redirect — console errors are now shown on the Status page.
// ABOUTME: Redirects to /status for backward compatibility.
import { redirect } from 'next/navigation'

export default function ConsolePage() {
  redirect('/status')
}
