import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'
import ScrollableCoverStrip from './CoverStrip'

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
  processing: OverseerrRequest[]
  available: OverseerrRequest[]
  declined: OverseerrRequest[]
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185'

function toStripItems(reqs: OverseerrRequest[], uiUrl: string) {
  return reqs
    .filter(r => r.poster)
    .map(r => ({
      coverUrl: `${TMDB_IMG}${r.poster}`,
      title: r.title || '',
      linkUrl: uiUrl && r.tmdbId
        ? `${uiUrl}/${r.type === 'tv' ? 'tv' : 'movie'}/${r.tmdbId}`
        : undefined,
    }))
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

function StripSection({ label, items, height }: { label: string; items: ReturnType<typeof toStripItems>; height: number }) {
  if (items.length === 0) return null
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <ScrollableCoverStrip items={items} height={height} />
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
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
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

  const stats      = data.stats      || { pending: 0, processing: 0, available: 0, declined: 0, total: 0, movie: 0, tv: 0 }
  const pending    = data.pending    || []
  const processing = data.processing || []
  const available  = data.available  || []
  const declined   = data.declined   || []
  const uiUrl      = (data.uiUrl || '').replace(/\/$/, '')

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

  const pendingItems    = toStripItems(pending, uiUrl)
  const processingItems = toStripItems(processing, uiUrl)
  const availableItems  = toStripItems(available, uiUrl)
  const declinedItems   = toStripItems(declined, uiUrl)

  const statsRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
      <StatPill label="Pending"    value={stats.pending}    color="var(--amber)"   />
      <StatPill label="Processing" value={stats.processing} color="var(--accent2)" />
      <StatPill label="Available"  value={stats.available}  color="var(--green)"   />
      {stats.declined > 0 && <StatPill label="Declined" value={stats.declined} color="var(--red)" />}
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
            style={{ fontSize: 10, color: 'var(--text-dim)', textDecoration: 'none' }}>↗</a>
        )}
      </div>
    </div>
  )

  // ── 2x: stats + pending filmstrip ────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'hidden' }}>
        {statsRow}
        {pendingItems.length > 0
          ? <ScrollableCoverStrip items={pendingItems} height={90} />
          : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No pending requests</div>
        }
      </div>
    )
  }

  // ── 4x+: stats + filmstrip per status ────────────────────────────────────
  const hasAny = pendingItems.length > 0 || processingItems.length > 0 || availableItems.length > 0 || declinedItems.length > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'hidden' }}>
      {statsRow}
      <StripSection label="Pending"    items={pendingItems}    height={100} />
      <StripSection label="Processing" items={processingItems} height={100} />
      <StripSection label="Available"  items={availableItems}  height={100} />
      {declinedItems.length > 0 && (
        <div style={{ flexShrink: 0, opacity: 0.45 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: 4 }}>Declined</div>
          <ScrollableCoverStrip items={declinedItems} height={100} />
        </div>
      )}
      {!hasAny && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center',
          fontSize: 12, color: 'var(--text-dim)' }}>No requests</div>
      )}
    </div>
  )
}
