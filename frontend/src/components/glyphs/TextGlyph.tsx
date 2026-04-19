import { Glyph } from '../../api'

export default function TextGlyph({ glyph }: { glyph: Glyph }) {
  const cfg = (() => { try { return JSON.parse(glyph.config) } catch { return {} } })()
  const text = cfg.text || ''
  const color = cfg.color || 'var(--text-dim)'
  const fontSize = cfg.size === 'small' ? 10 : cfg.size === 'large' ? 14 : 12

  if (!text) return null

  return (
    <span style={{ fontSize, color, fontFamily: 'DM Mono, monospace',
      fontWeight: 500, letterSpacing: '0.04em' }}>
      {text}
    </span>
  )
}
