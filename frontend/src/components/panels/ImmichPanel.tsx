import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface ImmichPhoto { id: string; title?: string }
interface ImmichData {
  uiUrl: string; integrationId: string; version: string
  photos: number; videos: number; usage: number; users: number
  preview?: ImmichPhoto[]
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtBytes(b: number) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
  if (b >= 1e9)  return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6)  return `${(b / 1e6).toFixed(0)} MB`
  return `${b} B`
}

function authedFetch(url: string) {
  const token = localStorage.getItem('stoa_token')
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}

function AuthenticatedThumb({ src, alt }: { src: string; alt: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    authedFetch(src)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.blob() })
      .then(blob => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setObjectUrl(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [src])

  if (!objectUrl) return (
    <div style={{ width: '100%', height: '100%', background: 'var(--surface2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>…</span>
    </div>
  )

  return (
    <img src={objectUrl} alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  )
}

function PhotoCarousel({ photos, integrationId, uiUrl }: {
  photos: ImmichPhoto[]; integrationId: string; uiUrl: string
}) {
  const [current, setCurrent] = useState(0)
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setCurrent(c => (c + 1) % photos.length)
  }, [photos.length])

  useEffect(() => {
    if (hovered || photos.length <= 1) return
    timerRef.current = setInterval(advance, 4000)
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [hovered, advance, photos.length])

  if (photos.length === 0) return null

  const photo = photos[current]
  const thumbUrl = `/api/immich/${integrationId}/thumb/${photo.id}`

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <a href={uiUrl || undefined} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', width: '100%', height: '100%', textDecoration: 'none' }}>
        <AuthenticatedThumb src={thumbUrl} alt={photo.title || 'Photo'} key={thumbUrl} />
      </a>

      {/* Bottom gradient + title */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
        padding: '20px 10px 8px', pointerEvents: 'none',
      }}>
        {photo.title && (
          <span style={{
            fontSize: 11, color: '#fff', fontWeight: 500,
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            paddingRight: photos.length > 1 ? 52 : 0,
          }}>
            {photo.title}
          </span>
        )}
      </div>

      {/* Dot nav */}
      {photos.length > 1 && (
        <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 3, zIndex: 2 }}>
          {photos.map((_, i) => (
            <button key={i}
              onClick={e => { e.preventDefault(); setCurrent(i) }}
              style={{
                width: i === current ? 14 : 5, height: 5, borderRadius: 3,
                background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'width 0.25s, background 0.25s',
              }} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, icon, href, grow = false }: {
  label: string; value: number | string; icon: string; href?: string; grow?: boolean
}) {
  const inner = (
    <>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13,
          color: 'var(--text)', lineHeight: 1.2 }}>
          {typeof value === 'number' ? fmtCount(value) : value}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.2 }}>{label}</span>
      </div>
    </>
  )
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
    borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)',
    flex: grow ? 1 : '0 0 auto', minWidth: 0,
    textDecoration: 'none', color: 'inherit',
  }
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={style}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>{inner}</a>
    : <div style={style}>{inner}</div>
}

function StatGrid({ data, uiUrl }: { data: ImmichData; uiUrl: string }) {
  const stats = [
    { key: 'photos',  label: 'photos',  value: data.photos,  icon: '📷', href: uiUrl || undefined },
    { key: 'videos',  label: 'videos',  value: data.videos,  icon: '🎬' },
    ...(data.usage > 0   ? [{ key: 'storage', label: 'storage', value: fmtBytes(data.usage), icon: '💾' }] : []),
    ...(data.users  > 0  ? [{ key: 'users',   label: 'users',   value: data.users,            icon: '👤' }] : []),
  ].filter(s => typeof s.value === 'string' ? true : (s.value as number) > 0)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', alignContent: 'center' }}>
      {stats.map(s => (
        <Stat key={s.key} label={s.label} value={s.value} icon={s.icon} href={(s as any).href} />
      ))}
    </div>
  )
}

export default function ImmichPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ImmichData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<ImmichData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const preview = data.preview ?? []
  const hasCarousel = preview.length > 0 && !!data.integrationId

  // ── 1x — photos + videos + storage inline ────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
      <Stat label="photos"  value={data.photos} icon="📷" href={uiUrl || undefined} grow />
      <Stat label="videos"  value={data.videos} icon="🎬" grow />
      {data.usage > 0 && <Stat label="storage" value={fmtBytes(data.usage)} icon="💾" grow />}
    </div>
  )

  // ── 2x–3x — stat grid ────────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <StatGrid data={data} uiUrl={uiUrl} />
    </div>
  )

  // ── 4x+ — carousel + stats below ─────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
      {hasCarousel && (
        <div style={{ flex: '0 0 55%', maxHeight: 260, minHeight: 80 }}>
          <PhotoCarousel photos={preview} integrationId={data.integrationId} uiUrl={uiUrl} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'flex-start' }}>
        <StatGrid data={data} uiUrl={uiUrl} />
      </div>
    </div>
  )
}
