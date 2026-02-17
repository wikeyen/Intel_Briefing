// ABOUTME: Swiss-style section header — small-caps label with a horizontal rule.
// ABOUTME: Used at the top of every configuration page section.
interface Props { title: string }

export function SectionHeader({ title }: Props) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-muted)',
      }}>
        {title}
      </div>
      <div style={{ marginTop: '0.5rem', height: 1, background: 'var(--border)' }} />
    </div>
  )
}
