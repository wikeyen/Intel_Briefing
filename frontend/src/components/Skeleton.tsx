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

/** Skeleton layout for the status page — status strip + sensor card grid. */
export function StatusSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Status strip skeleton */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '0 3rem',
        minHeight: 52,
        maxWidth: 1024,
        margin: '0 auto',
        width: '100%',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Skeleton width={8} height={8} borderRadius={4} />
          <Skeleton width={60} height={12} />
        </div>
        <Skeleton width={80} height={12} />
        <Skeleton width={60} height={12} />
        <div style={{ marginLeft: 'auto' }}>
          <Skeleton width={90} height={12} />
        </div>
      </div>

      {/* Sensor card grid skeleton */}
      <div className="sensor-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
        flex: 1,
        alignContent: 'start',
        padding: '1rem 3rem',
        maxWidth: 1024,
        margin: '0 auto',
        width: '100%',
      }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '1rem',
            minHeight: 110,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Skeleton width={6} height={6} borderRadius={3} />
              <Skeleton width={80 + (i % 3) * 20} height={13} />
            </div>
            <Skeleton width={60} height={10} />
            <div style={{ marginTop: 'auto' }}>
              <Skeleton width={50 + (i % 2) * 20} height={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
