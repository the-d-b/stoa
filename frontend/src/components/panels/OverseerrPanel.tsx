import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface OverseerrStats {
  pending: number
  processing: number
  available: number
  declined: number
  total: number
  movie: number
  tv: number
}

interface OverseerrRequest {
  id: number
  type: string
  title: string
  poster: string
  year: string
  requestedBy: string
  requestedAt: string
  status: string
  tmdbId: number
}

interface OverseerrData {
  uiUrl: string
  version: string
  updateAvail: boolean
  stats: OverseerrStats
  pending: OverseerrRequest[]
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w92'

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '4px 10px', borderRadius: 6,
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 52,
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace', color }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}

function RequestRow({ req, uiUrl, showPoster }: { req: OverseerrRequest; uiUrl: string; showPoster?: boolean }) {
  const icon = req.type === 'movie' ? '🎬' : '📺'
  const title = req.title || `${req.type === 'movie' ? 'Movie' : 'Show'} #${req.tmdbId}`
  const href = uiUrl && req.tmdbId
    ? `${uiUrl.replace(/\/$/, '')}/${req.type === 'tv' ? 'tv' : 'movie'}/${req.tmdbId}`
    : undefined
  const posterUrl = req.poster ? `${TMDB_IMG}${req.poster}` : null

  const titleEl = href
    ? <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--text)', textDecoration: 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
        {title}{req.year ? ` (${req.year})` : ''}
      </a>
    : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
        {title}{req.year ? ` (${req.year})` : ''}
      </span>

  if (showPoster && posterUrl) {
    return (
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '5px 0', borderBottom: '1px solid var(--border)',
      }}>
        <img src={posterUrl} alt="" style={{
          width: 32, height: 48, borderRadius: 3, objectFit: 'cover', flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{titleEl}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            {req.requestedBy}{req.requestedAt ? ` · ${timeAgo(req.requestedAt)}` : ''}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', minWidth: 0,
    }}>
      <span style={{ fontSize: 11, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{titleEl}</div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {req.requestedBy}{req.requestedAt ? ` · ${timeAgo(req.requestedAt)}` : ''}
      </span>
    </div>
  )
}

export default function OverseerrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData]       = useState<OverseerrData | null>(null)
  const [error, setError]     = useState('')
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

  const sseData = useSSE<OverseerrData>(integrationId)
  useEffect(() => {
    if (sseData !== null) setData(sseData)
  }, [sseData])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  )
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12,
      color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  )
  if (!data) return null

  const stats   = data.stats   || { pending: 0, processing: 0, available: 0, declined: 0, total: 0, movie: 0, tv: 0 }
  const pending = data.pending || []
  const uiUrl   = (data.uiUrl || '').replace(/\/$/, '')

  // ── 1x: stats bar only ───────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', height: '100%', flexWrap: 'wrap' }}>
        <StatPill label="Pending"    value={stats.pending}    color="var(--amber)"   />
        <StatPill label="Processing" value={stats.processing} color="var(--accent2)" />
        <StatPill label="Available"  value={stats.available}  color="var(--green)"   />
        {stats.declined > 0 && <StatPill label="Declined" value={stats.declined} color="var(--red)" />}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
          {stats.total} total · {stats.movie}M {stats.tv}TV
        </span>
      </div>
    )
  }

  // ── 2x+: stats + pending queue ────────────────────────────────────────────
  const showPoster = heightUnits >= 4

  return (
    <div style={{ padding: '10px 12px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column' }}>

      {/* Header: stats + version/link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <StatPill label="Pending"    value={stats.pending}    color="var(--amber)"   />
        <StatPill label="Processing" value={stats.processing} color="var(--accent2)" />
        <StatPill label="Available"  value={stats.available}  color="var(--green)"   />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {data.updateAvail && (
            <span style={{ fontSize: 9, color: 'var(--amber)',
              border: '1px solid var(--amber)', borderRadius: 4, padding: '1px 5px' }}>
              UPDATE
            </span>
          )}
          {data.version && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {data.version}
            </span>
          )}
          {uiUrl && (
            <a href={uiUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10, color: 'var(--text-dim)', textDecoration: 'none' }}>
              Overseerr ↗
            </a>
          )}
        </div>
      </div>

      {/* Pending list */}
      {pending.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center',
          fontSize: 12, color: 'var(--text-dim)' }}>
          No pending requests
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending
          </div>
          {pending.map(req => (
            <RequestRow key={req.id} req={req} uiUrl={uiUrl} showPoster={showPoster} />
          ))}
        </div>
      )}
    </div>
  )
}
