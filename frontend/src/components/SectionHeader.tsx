// ABOUTME: Editorial section header for two-column layout — large number, title, description.
// ABOUTME: Used as the left column of each configuration section.
interface Props {
  num: string
  title: string
  description: string
}

export function SectionHeader({ num, title, description }: Props) {
  return (
    <div style={{ paddingTop: '0.25rem' }}>
      <div style={{
        fontSize: '3rem',
        fontWeight: 700,
        color: 'var(--border)',
        lineHeight: 1,
        fontFamily: 'ui-monospace, monospace',
        letterSpacing: '-0.02em',
        marginBottom: '1.25rem',
        userSelect: 'none',
      }}>
        {num}
      </div>
      <h2 style={{
        fontSize: '1.125rem',
        fontWeight: 600,
        color: 'var(--ink)',
        letterSpacing: '-0.01em',
        marginBottom: '0.75rem',
      }}>
        {title}
      </h2>
      <p style={{
        fontSize: '0.875rem',
        color: 'var(--ink-muted)',
        lineHeight: 1.7,
      }}>
        {description}
      </p>
    </div>
  )
}
