interface Props {
  icon?: string
  error: string
  onRetry?: () => void
}

export default function PanelError({ icon = '⚠', error, onRetry }: Props) {
  return (
    <div style={{ padding: '12px 14px', height: '100%', display: 'flex',
      flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
        <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
          wordBreak: 'break-word' }}>{error}</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ghost"
          style={{ fontSize: 11, alignSelf: 'flex-start', color: 'var(--text-dim)' }}>
          Retry
        </button>
      )}
    </div>
  )
}
