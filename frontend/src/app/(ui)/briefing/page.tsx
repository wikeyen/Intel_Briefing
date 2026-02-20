// ABOUTME: Briefing page redirect — briefing is now a tab within the Feed page.
// ABOUTME: Redirects to /data for backward compatibility.
import { redirect } from 'next/navigation'

export default function BriefingPage() {
  redirect('/data')
}
