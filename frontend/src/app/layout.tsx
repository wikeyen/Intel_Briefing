// ABOUTME: Root Next.js layout — loads global styles and sets document metadata.
// ABOUTME: All pages inherit this layout; UI shell is in the (ui) route group layout.
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Info Aggregation',
  description: 'Tech information aggregation dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  )
}
