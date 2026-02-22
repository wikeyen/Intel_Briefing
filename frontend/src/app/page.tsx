// ABOUTME: Root page — redirects to /dashboard as the default landing page.
// ABOUTME: Uses Next.js redirect for clean URL handling.
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
