import { useState } from 'react'
import { useTheme, THEMES, ThemeDef } from '../../context/ThemeContext'

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  const dispatchExpand = (expand: boolean) => {
    window.dispatchEvent(new CustomEvent('stoa:expandAll', { detail: { expand } }))
  }

  const darkThemes = THEMES.filter(t => t.dark)
  const lightThemes = THEMES.filter(t => !t.dark)

  return (
    <div style={{ position: 'fixed', bottom: 52, right: 20, zIndex: 200 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 48, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 12, padding: 16, width: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dark</div>
          <ThemeRow themes={darkThemes} current={theme} onSelect={setTheme} />

          <div style={{ fontSize: 11, color: 'var(--text-dim)', margin: '12px 0 10px',
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Light</div>
          <ThemeRow themes={lightThemes} current={theme} onSelect={setTheme} />
        </div>
      )}

      {/* Expand / collapse all panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <button onClick={() => dispatchExpand(true)}
          title="Expand all panels"
          style={{ width: 36, height: 28, borderRadius: 8, border: '1px solid var(--border2)',
            background: 'var(--surface)', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          ＋
        </button>
        <button onClick={() => dispatchExpand(false)}
          title="Collapse all panels"
          style={{ width: 36, height: 28, borderRadius: 8, border: '1px solid var(--border2)',
            background: 'var(--surface)', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          －
        </button>
      </div>

      {/* Color wheel button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Change theme"
        style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '2px solid var(--border2)',
          background: 'var(--surface)',
          cursor: 'pointer', padding: 0, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          boxShadow: open ? '0 0 0 3px var(--accent-bg)' : 'none',
        }}
      >
        <ColorWheelIcon />
      </button>
    </div>
  )
}

function ThemeRow({ themes, current, onSelect }: {
  themes: ThemeDef[]
  current: string
  onSelect: (t: any) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {themes.map(t => (
        <button
          key={t.name}
          onClick={() => onSelect(t.name)}
          title={t.label}
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: t.swatch, border: 'none', cursor: 'pointer',
            outline: current === t.name ? '2px solid var(--text)' : '2px solid transparent',
            outlineOffset: 2,
            transform: current === t.name ? 'scale(1.15)' : 'scale(1)',
            transition: 'all 0.15s',
          }}
        />
      ))}
    </div>
  )
}

function ColorWheelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" fill="conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" />
      <path d="M10 2 A8 8 0 0 1 18 10" stroke="#ff4444" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M18 10 A8 8 0 0 1 10 18" stroke="#ffcc00" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M10 18 A8 8 0 0 1 2 10" stroke="#44ff44" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M2 10 A8 8 0 0 1 10 2" stroke="#4444ff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="10" r="3" fill="var(--surface)" />
    </svg>
  )
}
