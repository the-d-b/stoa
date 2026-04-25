import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface LidarrAlbum {
  id: number; title: string; artistName: string
  releaseDate?: string; date?: string
  foreignArtistId?: string; foreignAlbumId?: string
  coverUrl?: string
}
interface LidarrData {
  uiUrl: string
  history: LidarrAlbum[]; missing: LidarrAlbum[]
  missingCount: number; artistCount: number; albumCount: number; onDiskCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const linkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none', fontWeight: 500 }
const linkHover = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'underline' }
const linkOut  = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'none' }

function ArtistLink({ uiUrl, artistName, foreignArtistId }: { uiUrl: string; artistName: string; foreignArtistId?: string }) {
  const href = uiUrl && foreignArtistId
    ? `${uiUrl}/artist/${foreignArtistId}`
    : uiUrl
      ? `${uiUrl}/artist`
      : `https://musicbrainz.org/search?query=${encodeURIComponent(artistName)}&type=artist`
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ ...linkStyle, color: 'var(--text-muted)', fontWeight: 400 }}
      onMouseOver={linkHover} onMouseOut={linkOut}>
      {artistName}
    </a>
  )
}

function groupByArtist(albums: LidarrAlbum[]) {
  const groups: { artistName: string; albums: LidarrAlbum[] }[] = []
  for (const a of albums) {
    const existing = groups.find(g => g.artistName === a.artistName)
    if (existing) existing.albums.push(a)
    else groups.push({ artistName: a.artistName, albums: [a] })
  }
  return groups
}

function HistoryGroups({ groups, uiUrl }: { groups: ReturnType<typeof groupByArtist>; uiUrl: string }) {
  return (
    <>
      {groups.map(group => (
        <div key={group.artistName} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArtistLink uiUrl={uiUrl} artistName={group.artistName}
            foreignArtistId={group.albums[0]?.foreignArtistId} />
            <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>
          </div>
          {group.albums.map((a, i) => {
            const date = a.date || a.releaseDate || ''
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                padding: '1px 0 1px 8px', fontSize: 11 }}>
                <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </span>
                {date && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                    {formatDate(date)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function AlbumCoverStrip({ items, uiUrl }: { items: LidarrAlbum[]; uiUrl: string }) {
  const covers = items.filter(a => a.coverUrl)
  if (covers.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10,
      scrollbarWidth: 'none' }}>
      {covers.map((a, i) => (
        <a key={i}
          href={uiUrl && a.foreignArtistId ? `${uiUrl}/artist/${a.foreignArtistId}` : uiUrl}
          target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
          <img src={a.coverUrl} alt={a.title}
            style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 5,
              display: 'block', opacity: 0.85 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </a>
      ))}
    </div>
  )
}

export default function LidarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<LidarrData | null>(null)
  const [missingSample, setMissingSample] = useState<LidarrAlbum[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const SAMPLE_SIZE = 8

  const resample = (missing: LidarrAlbum[]) => {
    const shuffled = [...missing].sort(() => Math.random() - 0.5)
    setMissingSample(shuffled.slice(0, SAMPLE_SIZE))
  }

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 300

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data)
      resample(res.data.missing || [])
      setError('')
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
  const historyGroups = groupByArtist(data.history || [])

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 4, marginTop: 10 }}>{text}</div>
  )

  const statsBar = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[
        { label: 'Artists', value: data.artistCount },
        { label: 'Albums',  value: data.albumCount },
        { label: 'Tracks',  value: (data.onDiskCount ?? 0).toLocaleString() },
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

  if (heightUnits <= 1) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{statsBar}</div>

  // 2x and above — stats + history grouped by artist
  const allCovers = [...(data.missing || []), ...(data.history || [])]

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <AlbumCoverStrip items={allCovers} uiUrl={uiUrl} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{statsBar}</div>
      {sectionTitle('Recently downloaded')}
      {historyGroups.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : <HistoryGroups groups={historyGroups} uiUrl={uiUrl} />
      }
      {heightUnits >= 4 && (data.missingCount || 0) > 0 && (
        <>
          {sectionTitle(`Wanted — ${data.missingCount} total`)}
          {missingSample.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <ArtistLink uiUrl={uiUrl} artistName={a.artistName} foreignArtistId={a.foreignArtistId} />
                {a.artistName && a.title && <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>—</span>}
                <span>{a.title}</span>
              </span>
              {a.releaseDate && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                  {formatDate(a.releaseDate)}
                </span>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
