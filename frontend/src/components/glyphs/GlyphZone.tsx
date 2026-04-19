import React from 'react'
import { Glyph } from '../../api'
import ClockGlyph from './ClockGlyph'
import WeatherGlyph from './WeatherGlyph'
import KumaGlyph from './KumaGlyph'
import TrueNASGlyph from './TrueNASGlyph'
import OPNsenseGlyph from './OPNsenseGlyph'
import ProxmoxGlyph from './ProxmoxGlyph'
import PingGlyph from './PingGlyph'
import TextGlyph from './TextGlyph'

// Error boundary — catches render errors in any glyph
class GlyphErrorBoundary extends React.Component<
  { glyphId: string; glyphType: string; children: React.ReactNode },
  { error: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { error: false }
  }
  static getDerivedStateFromError() { return { error: true } }
  componentDidCatch(err: Error) {
    console.error(`[Glyph:${this.props.glyphType}:${this.props.glyphId}]`, err.message)
  }
  render() {
    if (this.state.error) {
      return (
        <span
          title={`Glyph error (${this.props.glyphType}) — check console`}
          style={{ fontSize: 14, color: 'var(--amber)', opacity: 0.7, cursor: 'help' }}
        >⚠</span>
      )
    }
    return this.props.children
  }
}

function GlyphRenderer({ glyph }: { glyph: Glyph }) {
  switch (glyph.type) {
    case 'clock':    return <ClockGlyph glyph={glyph} />
    case 'weather':  return <WeatherGlyph glyph={glyph} />
    case 'kuma':     return <KumaGlyph glyph={glyph} />
    case 'truenas':  return <TrueNASGlyph glyph={glyph} />
    case 'opnsense': return <OPNsenseGlyph glyph={glyph} />
    case 'proxmox':  return <ProxmoxGlyph glyph={glyph} />
    case 'ping':     return <PingGlyph glyph={glyph} />
    case 'text':     return <TextGlyph glyph={glyph} />
    default:
      console.warn(`[GlyphZone] unknown glyph type: ${glyph.type}`)
      return null
  }
}

interface GlyphZoneProps {
  glyphs: Glyph[]
  zone: string
  activePorticoId?: string
  style?: React.CSSProperties
}

export default function GlyphZone({ glyphs, zone, activePorticoId = 'home', style }: GlyphZoneProps) {
  const zoneGlyphs = glyphs
    .filter(g => {
      if (!g.enabled || g.zone !== zone) return false
      // Portico filtering — empty array means show on all porticos
      const cfg = (() => { try { return JSON.parse((g as any).config || '{}') } catch { return {} } })()
      const assigned: string[] = cfg.porticos || []
      if (assigned.length === 0) return true
      return assigned.includes(activePorticoId)
    })
    .sort((a, b) => a.position - b.position)

  // Debug: log when glyphs array changes
  if (glyphs.length > 0) {
    console.log(`[GlyphZone:${zone}] total=${glyphs.length} enabled-in-zone=${zoneGlyphs.length}`,
      glyphs.map(g => `${g.type}@${g.zone}(enabled=${g.enabled})`))
  }

  if (zoneGlyphs.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...style }}>
      {zoneGlyphs.map(g => (
        <GlyphErrorBoundary key={g.id} glyphId={g.id} glyphType={g.type}>
          <GlyphRenderer glyph={g} />
        </GlyphErrorBoundary>
      ))}
    </div>
  )
}
