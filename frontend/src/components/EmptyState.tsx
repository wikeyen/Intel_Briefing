// ABOUTME: Shared empty-state component with themed SVG illustrations for pages with no data.
// ABOUTME: Provides radar, stream, search, key, and sparkle illustration variants with optional CTA.
'use client'

import Link from 'next/link'

/* ── Illustration: animated radar sweep (dashboard / general) ─────────── */
function RadarIllustration() {
  return (
    <svg width="140" height="140" viewBox="0 0 160 160" fill="none">
      <circle cx="80" cy="80" r="70" stroke="var(--accent)" strokeWidth="1" opacity="0.08">
        <animate attributeName="r" values="50;75" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="80" cy="80" r="55" stroke="var(--accent)" strokeWidth="1" opacity="0.12">
        <animate attributeName="r" values="40;65" dur="3s" begin="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0" dur="3s" begin="1s" repeatCount="indefinite" />
      </circle>
      <circle cx="80" cy="80" r="40" stroke="var(--accent)" strokeWidth="1" opacity="0.15">
        <animate attributeName="r" values="30;55" dur="3s" begin="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0" dur="3s" begin="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="80" cy="80" r="55" stroke="var(--ink-tertiary)" strokeWidth="0.5" opacity="0.15" strokeDasharray="3 3" />
      <circle cx="80" cy="80" r="35" stroke="var(--ink-tertiary)" strokeWidth="0.5" opacity="0.12" strokeDasharray="2 4" />
      <line x1="80" y1="25" x2="80" y2="135" stroke="var(--ink-tertiary)" strokeWidth="0.5" opacity="0.1" />
      <line x1="25" y1="80" x2="135" y2="80" stroke="var(--ink-tertiary)" strokeWidth="0.5" opacity="0.1" />
      <line x1="80" y1="80" x2="80" y2="25" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 80 80" to="360 80 80" dur="4s" repeatCount="indefinite" />
      </line>
      <path d="M80 80 L80 25 A55 55 0 0 1 127 57 Z" fill="url(#sweepGrad)">
        <animateTransform attributeName="transform" type="rotate" from="0 80 80" to="360 80 80" dur="4s" repeatCount="indefinite" />
      </path>
      <defs>
        <linearGradient id="sweepGrad" x1="80" y1="25" x2="127" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="3" fill="var(--accent)" opacity="0.6" />
      <circle cx="80" cy="80" r="1.5" fill="var(--accent)" />
    </svg>
  )
}

/* ── Illustration: flowing data stream (feed page) ────────────────────── */
function StreamIllustration() {
  return (
    <svg width="140" height="140" viewBox="0 0 160 160" fill="none">
      {/* Horizontal stream lines with flowing dots */}
      {[40, 60, 80, 100, 120].map((y, i) => (
        <g key={y}>
          <line x1="20" y1={y} x2="140" y2={y} stroke="var(--ink-tertiary)" strokeWidth="0.5" opacity={0.08 + i * 0.02} />
          <circle cx="20" cy={y} r="2" fill="var(--accent)" opacity="0.6">
            <animate attributeName="cx" values="20;140" dur={`${2.5 + i * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.6;0.6;0" dur={`${2.5 + i * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      {/* Placeholder card outlines */}
      <rect x="30" y="45" width="40" height="28" rx="3" stroke="var(--ink-tertiary)" strokeWidth="0.7" opacity="0.1" strokeDasharray="2 2" />
      <rect x="60" y="72" width="40" height="28" rx="3" stroke="var(--ink-tertiary)" strokeWidth="0.7" opacity="0.08" strokeDasharray="2 2" />
      <rect x="90" y="55" width="40" height="28" rx="3" stroke="var(--ink-tertiary)" strokeWidth="0.7" opacity="0.12" strokeDasharray="2 2" />
      {/* Accent connector */}
      <path d="M50 73 Q80 90 100 55" stroke="var(--accent)" strokeWidth="1" opacity="0.15" fill="none" strokeDasharray="3 3">
        <animate attributeName="stroke-dashoffset" values="0;-12" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

/* ── Illustration: search / magnifying glass (no results) ─────────────── */
function SearchIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 160 160" fill="none">
      {/* Search circle */}
      <circle cx="72" cy="72" r="32" stroke="var(--ink-tertiary)" strokeWidth="1.5" opacity="0.2" />
      <circle cx="72" cy="72" r="32" stroke="var(--accent)" strokeWidth="1.5" opacity="0.3" strokeDasharray="8 8">
        <animate attributeName="stroke-dashoffset" values="0;-16" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* Handle */}
      <line x1="96" y1="96" x2="120" y2="120" stroke="var(--ink-tertiary)" strokeWidth="3" strokeLinecap="round" opacity="0.15" />
      {/* Empty result lines inside */}
      <line x1="56" y1="64" x2="88" y2="64" stroke="var(--ink-tertiary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.1" />
      <line x1="60" y1="72" x2="84" y2="72" stroke="var(--ink-tertiary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.08" />
      <line x1="58" y1="80" x2="86" y2="80" stroke="var(--ink-tertiary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.06" />
    </svg>
  )
}

/* ── Illustration: key / lock (needs API key) ─────────────────────────── */
function KeyIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 160 160" fill="none">
      {/* Key head (circle) */}
      <circle cx="65" cy="70" r="22" stroke="var(--warn, var(--accent))" strokeWidth="1.5" opacity="0.25" />
      <circle cx="65" cy="70" r="14" stroke="var(--warn, var(--accent))" strokeWidth="1" opacity="0.15" />
      <circle cx="65" cy="70" r="6" fill="var(--warn, var(--accent))" opacity="0.12" />
      {/* Key shaft */}
      <line x1="87" y1="70" x2="125" y2="70" stroke="var(--warn, var(--accent))" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
      {/* Key teeth */}
      <line x1="110" y1="70" x2="110" y2="82" stroke="var(--warn, var(--accent))" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
      <line x1="120" y1="70" x2="120" y2="78" stroke="var(--warn, var(--accent))" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
      {/* Shimmer */}
      <circle cx="65" cy="70" r="28" stroke="var(--warn, var(--accent))" strokeWidth="0.5" opacity="0.1">
        <animate attributeName="r" values="24;32" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

/* ── Illustration: sparkle / AI (configure AI) ────────────────────────── */
function SparkleIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 160 160" fill="none">
      {/* Main star */}
      <path
        d="M80 40 L85 70 L115 75 L85 80 L80 110 L75 80 L45 75 L75 70 Z"
        stroke="var(--accent)" strokeWidth="1" fill="var(--accent)" opacity="0.1"
      />
      <path
        d="M80 50 L83 70 L105 75 L83 80 L80 100 L77 80 L55 75 L77 70 Z"
        stroke="var(--accent)" strokeWidth="0.5" fill="var(--accent)" opacity="0.08"
      />
      {/* Orbiting small stars */}
      <circle cx="48" cy="48" r="2" fill="var(--accent)" opacity="0.3">
        <animate attributeName="opacity" values="0.1;0.4;0.1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="118" cy="55" r="1.5" fill="var(--accent)" opacity="0.25">
        <animate attributeName="opacity" values="0.1;0.35;0.1" dur="2.5s" begin="0.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="105" cy="115" r="1.5" fill="var(--accent)" opacity="0.2">
        <animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" begin="1s" repeatCount="indefinite" />
      </circle>
      <circle cx="42" cy="108" r="1" fill="var(--accent)" opacity="0.25">
        <animate attributeName="opacity" values="0.1;0.35;0.1" dur="3s" begin="0.3s" repeatCount="indefinite" />
      </circle>
      {/* Pulse ring */}
      <circle cx="80" cy="75" r="35" stroke="var(--accent)" strokeWidth="0.5" opacity="0.08">
        <animate attributeName="r" values="30;45" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.12;0" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

const ILLUSTRATIONS = {
  radar: RadarIllustration,
  stream: StreamIllustration,
  search: SearchIllustration,
  key: KeyIllustration,
  sparkle: SparkleIllustration,
} as const

export type IllustrationVariant = keyof typeof ILLUSTRATIONS

export interface EmptyStateProps {
  /** Which themed illustration to display */
  illustration: IllustrationVariant
  /** Main heading text */
  title: string
  /** Supporting description (can include JSX for links) */
  description?: React.ReactNode
  /** Optional CTA button/link */
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  /** Whether to fill the available viewport height */
  fullHeight?: boolean
  /** Use warn color scheme (for API key states) */
  warn?: boolean
}

export function EmptyState({
  illustration,
  title,
  description,
  action,
  fullHeight,
  warn,
}: EmptyStateProps) {
  const Illust = ILLUSTRATIONS[illustration]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: fullHeight ? 'calc(100dvh - 10rem)' : undefined,
      padding: fullHeight ? '2rem' : '3.5rem 2rem',
      textAlign: 'center',
      gap: '1.25rem',
    }}>
      <Illust />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', maxWidth: 340 }}>
        <h3 style={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: warn ? 'var(--warn, var(--ink))' : 'var(--ink)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h3>
        {description && (
          <p style={{
            fontSize: '0.8125rem',
            color: 'var(--ink-secondary)',
            margin: 0,
            lineHeight: 1.6,
          }}>
            {description}
          </p>
        )}
      </div>

      {action && (
        action.href ? (
          <Link
            href={action.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1.125rem',
              borderRadius: 7,
              background: warn ? 'var(--warn, var(--accent))' : 'var(--accent)',
              color: 'white',
              fontSize: '0.8125rem',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'opacity 150ms, transform 150ms',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h8M8 4l4 4-4 4" />
            </svg>
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1.125rem',
              borderRadius: 7,
              background: 'var(--accent)',
              color: 'white',
              fontSize: '0.8125rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 150ms, transform 150ms',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h8M8 4l4 4-4 4" />
            </svg>
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
