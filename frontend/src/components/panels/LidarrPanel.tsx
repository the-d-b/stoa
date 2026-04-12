import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface LidarrAlbum {
  id: number; title: string; artistName: string; foreignAlbumId?: string
  releaseDate?: string; hasFile: boolean; date?: string
}
interface LidarrData {
  uiUrl: string
  upcoming: LidarrAlbum[]; history: LidarrAlbum[]; missing: LidarrAlbum[]
  artistCount: number; albumCount: number; onDiskCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const linkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none', fontWeight: 500 }
const linkHover = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'underline' }
const linkOut  = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'none' }

function AlbumLink({ uiUrl, artistName, title }: { uiUrl: string; artistName: string; title: string }) {
  const href = uiUrl
    ? `${uiUrl}/artist`
    : `https://musicbrainz.org/search?query=${encodeURIComponent(artistName)}&type=artist`
  return (
    <span>
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ ...linkStyle, color: 'var(--text-muted)', fontWeight: 400 }}
        onMouseOver={linkHover} onMouseOut={linkOut}>
        {artistName}
      </a>
      {artistName && title && <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>—</span>}
      <span style={{ fontWeight: 500 }}>{title}</span>
    </span>
  )
}

export default function LidarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<LidarrData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 300

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

  const uiUrl = data.uiUrl || ''

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 4, marginTop: 10 }}>{text}</div>
  )

  const statsBar = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[
        { label: 'Artists', value: data.artistCount },
        { label: 'Albums',  value: data.albumCount },
        { label: 'Tracks',  value: data.onDiskCount.toLocaleString() },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 5, background: 'var(--surface2)',
          border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>{s.label}</span>
          <span style={{ fontWeight: 600, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{s.value}</span>
        </div>
      ))}
    </div>
  )

  const AlbumRow = ({ a, showDate }: { a: LidarrAlbum; showDate?: boolean }) => {
    const date = a.date || a.releaseDate || ''
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <AlbumLink uiUrl={uiUrl} artistName={a.artistName} title={a.title} />
        </span>
        {showDate && date && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
            {formatDate(date)}
          </span>
        )}
      </div>
    )
  }

  if (heightUnits <= 1) return <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>{statsBar}</div>

  if (heightUnits < 3) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {statsBar}
      {sectionTitle('Recently downloaded')}
      {(data.history || []).length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : (data.history || []).map((a, i) => <AlbumRow key={i} a={a} showDate />)
      }
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {statsBar}
      {(data.upcoming || []).length > 0 && (
        <>
          {sectionTitle('Upcoming releases')}
          {data.upcoming.map((a, i) => <AlbumRow key={i} a={a} showDate />)}
        </>
      )}
      {sectionTitle('Recently downloaded')}
      {(data.history || []).length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : (data.history || []).map((a, i) => <AlbumRow key={i} a={a} showDate />)
      }
      {heightUnits >= 4 && (data.missing || []).length > 0 && (
        <>
          {sectionTitle(`Wanted (${data.missing.length})`)}
          {data.missing.map((a, i) => <AlbumRow key={i} a={a} showDate />)}
        </>
      )}
    </div>
  )
}
