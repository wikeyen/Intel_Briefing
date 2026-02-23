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

/** Shared card style for config page skeletons. */
const skeletonCardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-card)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
}

/** Skeleton for a labeled input field (label bar + input-height bar). */
function FieldSkeleton({ labelWidth = 90 }: { labelWidth?: number }) {
  return (
    <div>
      <Skeleton width={labelWidth} height={10} style={{ marginBottom: 8 }} />
      <Skeleton height={36} borderRadius={6} />
    </div>
  )
}

/** Skeleton for a slider row (label + value on right + bar). */
function SliderSkeleton({ labelWidth = 120 }: { labelWidth?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Skeleton width={labelWidth} height={10} />
        <Skeleton width={30} height={12} />
      </div>
      <Skeleton height={6} borderRadius={3} />
    </div>
  )
}

/** Skeleton layout for the Pipeline config page — schedule, filters, output cards. */
export function PipelineSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2.5rem' }}>
      {/* Schedule card */}
      <div style={skeletonCardStyle}>
        <Skeleton width={60} height={10} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <FieldSkeleton labelWidth={100} />
          <FieldSkeleton labelWidth={60} />
        </div>
        <SliderSkeleton labelWidth={140} />
        <SliderSkeleton labelWidth={200} />
        <SliderSkeleton labelWidth={70} />
        <SliderSkeleton labelWidth={80} />
      </div>

      {/* Filters card */}
      <div style={skeletonCardStyle}>
        <Skeleton width={50} height={10} />
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              padding: '1.25rem 1.5rem',
              borderBottom: i === 0 ? '1px solid var(--border-soft)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <Skeleton width={8} height={8} borderRadius={4} />
                <Skeleton width={100} height={10} />
              </div>
              <Skeleton height={36} borderRadius={6} />
            </div>
          ))}
        </div>
      </div>

      {/* Output card */}
      <div style={skeletonCardStyle}>
        <Skeleton width={50} height={10} />
        <SliderSkeleton labelWidth={160} />
        <div>
          <Skeleton width={130} height={10} style={{ marginBottom: '1rem' }} />
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.25rem',
                padding: '0.875rem 1.25rem',
                borderBottom: i < 4 ? '1px solid var(--border-soft)' : 'none',
              }}>
                <Skeleton width={80} height={10} />
                <Skeleton style={{ flex: 1 }} height={6} borderRadius={3} />
                <Skeleton width={24} height={10} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton layout for the AI Summary config page — connection + prompts cards. */
export function AiSummarySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>
      {/* Connection card */}
      <div>
        <Skeleton width={80} height={10} style={{ marginBottom: '0.75rem' }} />
        <div style={skeletonCardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <FieldSkeleton labelWidth={60} />
            <FieldSkeleton labelWidth={45} />
          </div>
          <FieldSkeleton labelWidth={120} />
          <FieldSkeleton labelWidth={110} />
          <FieldSkeleton labelWidth={60} />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 0 0',
            borderTop: '1px solid var(--border-soft)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Skeleton width={110} height={10} />
              <Skeleton width={240} height={8} />
            </div>
            <Skeleton width={70} height={28} borderRadius={6} />
          </div>
        </div>
      </div>

      {/* Prompts card */}
      <div>
        <Skeleton width={55} height={10} style={{ marginBottom: '0.75rem' }} />
        <div style={skeletonCardStyle}>
          <div>
            <Skeleton width={160} height={10} style={{ marginBottom: 8 }} />
            <Skeleton height={100} borderRadius={6} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton width={120} height={10} />
            <Skeleton width={10} height={10} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton layout for the Connections/API Keys page — grouped credential cards. */
export function ConnectionsSkeleton() {
  const groups = [
    { labelWidth: 90, fields: 1 },
    { labelWidth: 80, fields: 2 },
    { labelWidth: 110, fields: 5 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '4rem' }}>
      {groups.map((group, gi) => (
        <div key={gi} style={{
          ...skeletonCardStyle,
          padding: '1.5rem 1.75rem',
        }}>
          <Skeleton width={group.labelWidth} height={10} />
          {Array.from({ length: group.fields }, (_, fi) => (
            <div key={fi}>
              <Skeleton width={120 + (fi % 3) * 30} height={10} style={{ marginBottom: 8 }} />
              <Skeleton height={36} borderRadius={6} />
              <Skeleton width={200 + (fi % 2) * 60} height={8} style={{ marginTop: 6 }} />
            </div>
          ))}
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
