// ABOUTME: Root page — redirects to the dashboard as the default landing page.
// ABOUTME: Respects the optional base path when deployed under a URL prefix.
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
