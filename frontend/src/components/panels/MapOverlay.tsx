/**
 * MapOverlay — full-screen map opened from MapPanel. Desktop-only, same
 * pattern as CalendarOverlay: free navigation via Leaflet's own pan/zoom,
 * person filter pills in the header, roster list down the side.
 */
import { useEffect, useState, useRef } from 'react'
import { colorFor, timeAgo, useLeafletMap, MapMarker } from './MapPanel'

export default function MapOverlay({ markers, onClose }: { markers: MapMarker[]; onClose: () => void }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  useLeafletMap(containerRef, markers, hiddenIds)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const allPeople = Array.from(new Map(markers.map(m => [m.id, m])).values())

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, width: 'min(96vw, 1300px)', height: 'min(92vh, 860px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Map</span>

          <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {allPeople.map(m => {
              const hidden = hiddenIds.has(m.id)
              const color = colorFor(m.id)
              return (
                <button key={m.id} onClick={() => setHiddenIds(prev => {
                    const next = new Set(prev)
                    if (next.has(m.id)) next.delete(m.id); else next.add(m.id)
                    return next
                  })} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', border: `1px solid ${hidden ? 'var(--border)' : color}`,
                  background: hidden ? 'transparent' : color + '22',
                  color: hidden ? 'var(--text-dim)' : 'var(--text)',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: hidden ? 'var(--border)' : color }} />
                  {m.name}
                </button>
              )
            })}
          </div>

          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 22, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Body — map + roster side by side */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: 1.7, minWidth: 0, padding: '12px 0 14px 14px' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden' }} />
          </div>

          <div style={{ flex: 1, minWidth: 280, maxWidth: 380, borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', padding: '14px 18px', overflow: 'auto' }}>
            {allPeople.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontStyle: 'italic' }}>No location data</div>
            ) : allPeople.filter(m => !hiddenIds.has(m.id)).map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: colorFor(m.id),
                  flexShrink: 0, marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  {m.address && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>{m.address}</div>}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 3 }}>
                    {typeof m.battery === 'number' && (
                      <span style={{ fontSize: 11, color: m.battery <= 20 && !m.charging ? 'var(--red)' : 'var(--text-dim)',
                        fontFamily: 'DM Mono, monospace' }}>
                        🔋{m.battery}%{m.charging ? '⚡' : ''}
                      </span>
                    )}
                    {m.isDriving && <span style={{ fontSize: 11, color: 'var(--amber)' }}>🚗 driving</span>}
                    <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{timeAgo(m.updatedAt || '')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
