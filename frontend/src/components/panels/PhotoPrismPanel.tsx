import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface PhotoPrismData {
  uiUrl: string; version: string
  photos: number; videos: number; albums: number; folders: number
  moments: number; people: number; places: number; labels: number
}

function fmt(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}


export default function PhotoPrismPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PhotoPrismData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 300 // 5 min — stats rarely change

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')

  const Stat = ({ label, value, icon, href }: { label: string; value: number | string; icon: string; href?: string }) => {
    const inner = (
      <>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13,
            color: 'var(--text)', lineHeight: 1.2 }}>
            {typeof value === 'number' ? fmt(value) : value}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.2 }}>{label}</span>
        </div>
      </>
    )
    const style: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)',
      flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit',
    }
    return href
      ? <a href={href} target="_blank" rel="noopener noreferrer" style={style}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>{inner}</a>
      : <div style={style}>{inner}</div>
  }

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── 1x — photos, videos, size ─────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
      <Stat label="photos" value={data.photos} icon="📷" href={uiUrl || undefined} />
      <Stat label="videos" value={data.videos} icon="🎬" />
    </div>
  )

  // ── 2x and larger — same layout ─────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Stat label="photos" value={data.photos} icon="📷" href={uiUrl || undefined} />
        <Stat label="videos" value={data.videos} icon="🎬" />
      </div>
      {sectionTitle('Library')}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', marginBottom: 5 }}>
        {data.albums > 0 && <Stat label="albums" value={data.albums} icon="🗂️" />}
        {data.people > 0 && <Stat label="people" value={data.people} icon="👤" />}
        {data.places > 0 && <Stat label="places" value={data.places} icon="📍" />}
        {data.labels > 0 && <Stat label="labels" value={data.labels} icon="🏷️" />}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
        {data.moments > 0 && <Stat label="moments" value={data.moments} icon="⏰" />}
        {data.folders > 0 && <Stat label="folders" value={data.folders} icon="📁" />}
      </div>
    </div>
  )
}
