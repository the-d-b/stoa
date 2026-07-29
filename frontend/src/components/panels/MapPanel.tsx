import { useState, useEffect, useCallback, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { integrationsApi, Panel } from '../../api'
import { useSSERefresh } from '../../hooks/useSSE'
import MapOverlay from './MapOverlay'

export interface MapMarker {
  source: string
  id: string
  name: string
  lat: number
  lng: number
  accuracy?: number
  battery?: number
  charging?: boolean
  isDriving?: boolean
  address?: string
  updatedAt?: string
  groupLabel?: string
}

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#a855f7', '#06b6d4', '#ef4444', '#84cc16']

export function colorFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export function markerDivIcon(m: MapMarker): L.DivIcon {
  const color = colorFor(m.id)
  return L.divIcon({
    className: 'stoa-map-marker',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};
      border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      color:white;font:700 11px 'DM Mono',monospace;">${initials(m.name)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

// Imperative Leaflet map bound via a *callback ref* so it survives React
// recreating/reparenting the container node — which happens on a height-tier
// switch (2x and 4x nest the map at different depths) and on some panel
// refreshes. A plain ref left the map orphaned on the dead node; rebuilding on
// the live node keeps it from vanishing. Bounds are fit once per map instance.
export function useLeafletMap(markers: MapMarker[], hiddenIds: Set<string>) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const firstFitRef = useRef(false)
  // Refs so the callback ref / ResizeObserver (created once) always see current data.
  const markersRef = useRef(markers); markersRef.current = markers
  const hiddenRef = useRef(hiddenIds); hiddenRef.current = hiddenIds

  // Fit to markers, but only once per map and only after it has a real size —
  // fitting a zero-size map yields a bogus view.
  const fitIfNeeded = () => {
    const map = mapRef.current
    if (!map || firstFitRef.current || map.getSize().x === 0) return
    const visible = markersRef.current.filter(m => !hiddenRef.current.has(m.id))
    if (visible.length === 0) return
    firstFitRef.current = true
    if (visible.length === 1) {
      map.setView([visible[0].lat, visible[0].lng], 13)
    } else {
      map.fitBounds(L.latLngBounds(visible.map(m => [m.lat, m.lng] as [number, number])), { padding: [30, 30] })
    }
  }

  const syncMarkers = () => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const visible = markersRef.current.filter(m => !hiddenRef.current.has(m.id))
    for (const m of visible) {
      const marker = L.marker([m.lat, m.lng], { icon: markerDivIcon(m) })
      const battery = m.battery ? `${m.battery}%${m.charging ? ' ⚡' : ''}` : ''
      marker.bindTooltip(
        `<strong>${m.name}</strong>` +
        (m.address ? `<br>${m.address}` : '') +
        (battery ? `<br>${battery}` : '') +
        (m.updatedAt ? `<br><span style="opacity:0.7">${timeAgo(m.updatedAt)}</span>` : ''),
        { direction: 'top', offset: [0, -16] }
      )
      marker.addTo(layer)
    }
  }

  // React calls this with the node on attach and null on detach. On a height
  // change or refresh it detaches the old node and attaches a new one, so we
  // tear down and rebuild the map on whatever node is currently live.
  const setContainer = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null }
    firstFitRef.current = false
    if (!node) return
    const map = L.map(node, { zoomControl: true, attributionControl: true })
    map.setView([20, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // The container can be 0-height for a frame right after (re)attach; the
    // ResizeObserver re-measures the instant it gets real dimensions so tiles paint.
    const ro = new ResizeObserver(() => { map.invalidateSize(); fitIfNeeded() })
    ro.observe(node); roRef.current = ro
    syncMarkers()
    fitIfNeeded()
    requestAnimationFrame(() => { map.invalidateSize(); fitIfNeeded() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-sync markers whenever the data changes (e.g. Refresh Now / SSE update).
  useEffect(() => {
    if (mapRef.current) mapRef.current.invalidateSize()
    syncMarkers()
    fitIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, hiddenIds])

  return setContainer
}

export default function MapPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const sourceIds: string[] = (config.sources || []).map((s: any) => s.integrationId).filter(Boolean)
  const hasSources = sourceIds.length > 0

  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [error, setError] = useState('')
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const load = useCallback(async () => {
    if (!hasSources) return
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setMarkers(res.data?.markers || [])
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    }
  }, [panel.id, hasSources])

  // Initial fetch on mount; thereafter refresh live whenever any source's
  // background worker pushes a cache update over SSE — no polling. Each source
  // is its own integration, so we re-fetch the server-aggregated markers rather
  // than consume raw per-integration payloads.
  useEffect(() => { load() }, [load])
  useSSERefresh(sourceIds, load)

  const setMapContainer = useLeafletMap(markers, hiddenIds)

  if (error) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!hasSources) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>No data sources — configure in Admin → Panels</div>

  // ── 1x — compact summary pills, no map (too small to be useful) ────────────
  if (heightUnits <= 1) {
    const lowBattery = markers.filter(m => typeof m.battery === 'number' && m.battery! <= 20 && !m.charging)
    const mostRecent = markers.reduce<string>((acc, m) => (m.updatedAt && m.updatedAt > acc ? m.updatedAt : acc), '')
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>📍</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{markers.length}</span>
            <span style={{ color: 'var(--text-dim)' }}>tracked</span>
          </div>
          {lowBattery.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--red)', fontSize: 11 }}>
              <span style={{ color: 'var(--red)' }}>🔋</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--red)' }}>{lowBattery.length}</span>
              <span style={{ color: 'var(--text-dim)' }}>low</span>
            </div>
          )}
          {mostRecent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
              {timeAgo(mostRecent)}
            </div>
          )}
        </div>
      </div>
    )
  }

  const allPeople = Array.from(new Map(markers.map(m => [m.id, m])).values())

  const filterPills = allPeople.length > 1 && (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
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
            padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 500,
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
  )

  const mapEl = (
    <div style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      <div ref={setMapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )

  const expandBtn = !isMobile && (
    <button onClick={() => setOverlayOpen(true)} title="Expand map"
      style={{ position: 'absolute', top: 6, right: 6, zIndex: 400,
        background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer',
        color: 'var(--text-dim)', fontSize: 13, padding: '3px 6px', borderRadius: 5, lineHeight: 1 }}>⛶</button>
  )

  const overlay = overlayOpen && !isMobile ? (
    <MapOverlay markers={markers} onClose={() => setOverlayOpen(false)} />
  ) : null

  // ── 2-3x — map only ──────────────────────────────────────────────────────
  if (heightUnits < 4) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {mapEl}
        {expandBtn}
        {overlay}
      </div>
    )
  }

  // ── 4x+ — map + roster ───────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: '0 0 58%', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {mapEl}
        {expandBtn}
      </div>
      <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8, overflow: 'auto' }}>
        {filterPills}
        {allPeople.filter(m => !hiddenIds.has(m.id)).map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorFor(m.id), flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{m.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.address}</span>
            {typeof m.battery === 'number' && (
              <span style={{ fontSize: 10, color: m.battery <= 20 && !m.charging ? 'var(--red)' : 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                🔋{m.battery}%{m.charging ? '⚡' : ''}
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{timeAgo(m.updatedAt || '')}</span>
          </div>
        ))}
      </div>
      {overlay}
    </div>
  )
}
