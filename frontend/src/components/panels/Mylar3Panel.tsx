import { useEffect, useState, useCallback } from 'react'
import AuthCoverStrip from './AuthCoverStrip'
import { integrationsApi, Panel } from '../../api'

interface Mylar3Series {
  comicId: string
  name: string
}

interface Mylar3Issue {
  comicId: string
  comicName: string
  issueNumber: string
  date?: string
}

interface Mylar3Data {
  uiUrl: string
  integrationId: string
  seriesCount: number
  wantedCount: number
  upcomingCount: number
  series: Mylar3Series[]
  wanted: Mylar3Issue[]
  upcoming: Mylar3Issue[]
}

function StatsRow({ data }: { data: Mylar3Data }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-dim)' }}>
        <strong style={{ color: 'var(--text)' }}>{data.seriesCount}</strong> series
      </span>
      {data.wantedCount > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--accent)' }}>{data.wantedCount}</strong> wanted
        </span>
      )}
      {data.upcomingCount > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.upcomingCount}</strong> upcoming
        </span>
      )}
    </div>
  )
}

function IssueRow({ issue, uiUrl }: { issue: Mylar3Issue; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl}/comic-detail/${issue.comicId}` : undefined
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
              {issue.comicName}
            </a>
          : <span style={{ fontWeight: 500 }}>{issue.comicName}</span>
        }
        {issue.issueNumber && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
            #{issue.issueNumber}
          </span>
        )}
      </span>
      {issue.date && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {issue.date.slice(0, 10)}
        </span>
      )}
    </div>
  )
}

export default function Mylar3Panel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<Mylar3Data | null>(null)
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
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>📚 {error}</div>
  if (!data)   return null

  const integId = data.integrationId
  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const coverItems = (data.series ?? []).slice(0, 30).map(s => ({
    coverUrl: `/api/mylar3/${integId}/cover/${s.comicId}`,
    title: s.name,
    linkUrl: uiUrl ? `${uiUrl}/comic-detail/${s.comicId}` : undefined,
  }))

  const wantedList = data.wanted ?? []
  const upcomingList = data.upcoming ?? []

  // ── 1x: icon + stats ──────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>📚</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x: stats + wanted/upcoming lists ─────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {wantedList.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Wanted</div>
          {wantedList.slice(0, 10).map((issue, i) => (
            <IssueRow key={i} issue={issue} uiUrl={uiUrl} />
          ))}
        </div>
      )}
      {wantedList.length === 0 && upcomingList.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Upcoming</div>
          {upcomingList.slice(0, 10).map((issue, i) => (
            <IssueRow key={i} issue={issue} uiUrl={uiUrl} />
          ))}
        </div>
      )}
    </div>
  )

  // ── 4x+: cover strip + stats + wanted + upcoming ──────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {coverItems.length > 0 && <AuthCoverStrip items={coverItems} height={90} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, overflow: 'hidden' }}>
        {wantedList.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
              Wanted ({wantedList.length})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {wantedList.map((issue, i) => <IssueRow key={i} issue={issue} uiUrl={uiUrl} />)}
            </div>
          </div>
        )}
        {upcomingList.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
              Upcoming ({upcomingList.length})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {upcomingList.map((issue, i) => <IssueRow key={i} issue={issue} uiUrl={uiUrl} />)}
            </div>
          </div>
        )}
        {wantedList.length === 0 && upcomingList.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            All issues up to date
          </div>
        )}
      </div>
    </div>
  )
}
