import { useEffect, useState, useCallback } from 'react'
import AuthCoverStrip from './AuthCoverStrip'
import { integrationsApi, Panel } from '../../api'

interface TrangaManga {
  mangaId: string
  name: string
  status: string
}

interface TrangaJob {
  mangaId: string
  name: string
  state: string
}

interface TrangaData {
  uiUrl: string
  integrationId: string
  mangaCount: number
  downloading: number
  mangaList: TrangaManga[]
  activeJobs: TrangaJob[]
}

function statusColor(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'ongoing') return 'var(--green, #4caf50)'
  if (s === 'completed') return 'var(--text-dim)'
  if (s === 'cancelled' || s === 'hiatus') return 'var(--red, #f44336)'
  return 'var(--text-dim)'
}

function StatsRow({ data }: { data: TrangaData }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-dim)' }}>
        <strong style={{ color: 'var(--text)' }}>{data.mangaCount}</strong> manga
      </span>
      {data.downloading > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--accent)' }}>{data.downloading}</strong> downloading
        </span>
      )}
    </div>
  )
}

function MangaRow({ manga, uiUrl }: { manga: TrangaManga; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl}/manga/${encodeURIComponent(manga.mangaId)}` : undefined
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
              {manga.name}
            </a>
          : <span style={{ fontWeight: 500 }}>{manga.name}</span>
        }
      </span>
      {manga.status && (
        <span style={{ fontSize: 10, color: statusColor(manga.status), flexShrink: 0 }}>
          {manga.status}
        </span>
      )}
    </div>
  )
}

function JobRow({ job }: { job: TrangaJob }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>↓</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: 500 }}>
        {job.name || job.mangaId}
      </span>
    </div>
  )
}

export default function TrangaPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TrangaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>📖 {error}</div>
  if (!data)   return null

  const integId = data.integrationId
  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const mangaList = data.mangaList ?? []
  const activeJobs = data.activeJobs ?? []

  // Cover URL uses query param because Tranga manga IDs may contain path-unsafe chars
  const coverItems = mangaList.slice(0, 30).map(m => ({
    coverUrl: `/api/tranga/${integId}/cover?id=${encodeURIComponent(m.mangaId)}`,
    title: m.name,
    linkUrl: uiUrl ? `${uiUrl}/manga/${encodeURIComponent(m.mangaId)}` : undefined,
  }))

  // ── 1x: icon + stats ──────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>📖</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x: stats + manga list ────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {activeJobs.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          {activeJobs.slice(0, 3).map((j, i) => <JobRow key={i} job={j} />)}
        </div>
      )}
      {mangaList.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {mangaList.slice(0, 20).map((m, i) => (
            <MangaRow key={i} manga={m} uiUrl={uiUrl} />
          ))}
        </div>
      )}
    </div>
  )

  // ── 4x+: cover strip + stats + active downloads + manga list ─────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {coverItems.length > 0 && <AuthCoverStrip items={coverItems} height={90} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, overflow: 'hidden' }}>
        <div style={{ flex: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            Library
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {mangaList.map((m, i) => <MangaRow key={i} manga={m} uiUrl={uiUrl} />)}
          </div>
        </div>
        {activeJobs.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
              Downloading
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {activeJobs.map((j, i) => <JobRow key={i} job={j} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
