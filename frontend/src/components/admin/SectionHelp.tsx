import { useState } from 'react'

interface SectionHelpProps {
  storageKey: string
  title: string
  children: React.ReactNode
}

export default function SectionHelp({ storageKey, title, children }: SectionHelpProps) {
  const key = `stoa_help_dismissed_${storageKey}`
  const [visible, setVisible] = useState(() => localStorage.getItem(key) !== 'true')

  const dismiss = () => {
    localStorage.setItem(key, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10, marginBottom: 20,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      position: 'relative',
    }}>
      <button
        onClick={dismiss}
        style={{
          position: 'absolute', top: 10, right: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: '2px 6px',
          borderRadius: 4,
        }}
        title="Dismiss"
      >×</button>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, paddingRight: 24 }}>
        {children}
      </div>
    </div>
  )
}
