import { Glyph } from '../../api'
import ClockGlyph from './ClockGlyph'
import WeatherGlyph from './WeatherGlyph'

function GlyphRenderer({ glyph }: { glyph: Glyph }) {
  switch (glyph.type) {
    case 'clock':   return <ClockGlyph glyph={glyph} />
    case 'weather': return <WeatherGlyph glyph={glyph} />
    default:        return null
  }
}

interface GlyphZoneProps {
  glyphs: Glyph[]
  zone: string
  style?: React.CSSProperties
}

export default function GlyphZone({ glyphs, zone, style }: GlyphZoneProps) {
  const zoneGlyphs = glyphs
    .filter(g => g.enabled && g.zone === zone)
    .sort((a, b) => a.position - b.position)

  if (zoneGlyphs.length === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      ...style,
    }}>
      {zoneGlyphs.map(g => (
        <div key={g.id}>
          <GlyphRenderer glyph={g} />
        </div>
      ))}
    </div>
  )
}
