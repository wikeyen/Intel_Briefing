// ABOUTME: Reusable skeleton loading placeholders with shimmer animation.
// ABOUTME: Provides Skeleton (single bar), SkeletonBlock (card-sized), and page-level skeleton layouts.
'use client'

const SHIMMER_CSS = `
@keyframes skeletonShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`

/** Single skeleton bar — set width/height via style or defaults. */
export function Skeleton({ width, height = 14, borderRadius = 4, style }: {
  width?: number | string
  height?: number | string
  borderRadius?: number
  style?: React.CSSProperties
}) {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div style={{
        width: width ?? '100%',
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--surface-alt, #f0ede8) 30%, var(--border-soft, #e5e2dc) 50%, var(--surface-alt, #f0ede8) 70%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.8s ease-in-out infinite',
        ...style,
      }} />
    </>
  )
}

/** Card-shaped skeleton block with optional internal line rows. */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.625rem',
      ...style,
    }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={i === 0 ? '60%' : i === lines - 1 ? '40%' : '90%'}
          height={i === 0 ? 16 : 12}
        />
      ))}
    </div>
  )
}

/** Skeleton layout for the briefing tab — exec summary + section cards. */
export function BriefingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Executive summary skeleton */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        <Skeleton width={100} height={10} />
        <Skeleton width="95%" height={13} />
        <Skeleton width="100%" height={13} />
        <Skeleton width="88%" height={13} />
        <Skeleton width="70%" height={13} />
        <div style={{ height: 6 }} />
        <Skeleton width="92%" height={13} />
        <Skeleton width="100%" height={13} />
        <Skeleton width="55%" height={13} />
      </div>

      {/* Quick scan skeleton */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
      }}>
        <Skeleton width={80} height={10} />
        <Skeleton width="85%" height={12} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="75%" height={12} />
        <Skeleton width="65%" height={12} />
      </div>

      {/* Section cards skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '0.75rem',
      }}>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  )
}

/** Skeleton layout for the feed items list. */
export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Skeleton width={60} height={10} borderRadius={3} />
            <Skeleton width={80} height={10} borderRadius={3} />
          </div>
          <Skeleton width="80%" height={14} />
          <Skeleton width="100%" height={12} />
          <Skeleton width="60%" height={12} />
        </div>
      ))}
    </div>
  )
}

/** Skeleton layout for the status page — action bar + sensor table. */
export function StatusSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Action bar skeleton */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <Skeleton width={10} height={10} borderRadius={5} />
        <Skeleton width={120} height={14} />
        <div style={{ flex: 1 }} />
        <Skeleton width={100} height={32} borderRadius={6} />
      </div>

      {/* Sensor table skeleton */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.25rem',
            borderBottom: i < 7 ? '1px solid var(--border-soft)' : 'none',
          }}>
            <Skeleton width={14} height={14} borderRadius={3} />
            <Skeleton width={100 + (i % 3) * 30} height={13} />
            <div style={{ flex: 1 }} />
            <Skeleton width={50} height={10} />
            <Skeleton width={40} height={10} />
          </div>
        ))}
      </div>
    </div>
  )
}
