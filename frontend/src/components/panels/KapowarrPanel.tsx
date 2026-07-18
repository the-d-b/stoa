import { useEffect, useState, useCallback } from 'react'
import AuthCoverStrip from './AuthCoverStrip'
import PanelError from './PanelError'
import { integrationsApi, Panel } from '../../api'

interface KapowarrVolume {
  id: number
  title: string
  year: number
}

interface KapowarrQueItem {
  volumeId: number
  title: string
  status: string
}

interface KapowarrData {
  uiUrl: string
  integrationId: string
  volumes: number
  issues: number
  downloaded: number
  monitored: number
  volumeList: KapowarrVolume[]
  queue: KapowarrQueItem[]
}

function StatsRow({ data }: { data: KapowarrData }) {
  const pct = data.issues > 0
    ? Math.round((data.downloaded / data.issues) * 100)
    : null
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontSize: 11 }}>📚</span>{' '}
        <strong style={{ color: 'var(--accent)' }}>{data.volumes}</strong> volumes
      </span>
      {data.issues > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <span style={{ fontSize: 11 }}>🗞️</span>{' '}
          <strong style={{ color: 'var(--accent)' }}>{data.downloaded}</strong>
          <span>/{data.issues} issues</span>
          {pct !== null && (
            <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{pct}%</span>
          )}
        </span>
      )}
      {data.monitored > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <span style={{ fontSize: 11 }}>👁️</span>{' '}
          <strong style={{ color: 'var(--accent)' }}>{data.monitored}</strong> monitored
        </span>
      )}
      {data.queue.length > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <span style={{ fontSize: 11 }}>⏳</span>{' '}
          <strong style={{ color: 'var(--amber)' }}>{data.queue.length}</strong> queued
        </span>
      )}
    </div>
  )
}

function VolumeRow({ vol, uiUrl }: { vol: KapowarrVolume; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl}/volumes/${vol.id}` : undefined
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
              {vol.title}
            </a>
          : <span style={{ fontWeight: 500 }}>{vol.title}</span>
        }
      </span>
      {vol.year > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {vol.year}
        </span>
      )}
    </div>
  )
}

// One queue row per series, aggregating its queued issues
interface QueueGroup {
  volumeId: number
  title: string
  count: number
  statuses: string[]
}

function groupQueue(queue: KapowarrQueItem[], volumeTitles: Map<number, string>): QueueGroup[] {
  const map = new Map<number, QueueGroup>()
  for (const q of queue) {
    const g = map.get(q.volumeId)
    if (g) { g.count++; g.statuses.push(q.status) }
    else map.set(q.volumeId, {
      volumeId: q.volumeId,
      title: volumeTitles.get(q.volumeId) || q.title || `Volume ${q.volumeId}`,
      count: 1,
      statuses: [q.status],
    })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

function QueueGroupRow({ group, uiUrl }: { group: QueueGroup; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl}/volumes/${group.volumeId}` : undefined
  const uniform = group.statuses.every(s => s === group.statuses[0])
  const status = uniform ? group.statuses[0] : 'mixed'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>↓</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
              {group.title}
            </a>
          : <span style={{ fontWeight: 500 }}>{group.title}</span>
        }
      </span>
      {group.count > 1 && (
        <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {group.count} issues
        </span>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        textTransform: 'capitalize' }}>
        {status}
      </span>
    </div>
  )
}

export default function KapowarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<KapowarrData | null>(null)
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
  if (error)   return <PanelError icon="📥" error={error} onRetry={load} />
  if (!data)   return null

  const integId = data.integrationId
  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const volumes = data.volumeList ?? []
  const queue = data.queue ?? []

  const coverItems = volumes.slice(0, 30).map(v => ({
    coverUrl: `/api/kapowarr/${integId}/cover/${v.id}`,
    title: v.title,
    linkUrl: uiUrl ? `${uiUrl}/volumes/${v.id}` : undefined,
  }))

  const volumeTitles = new Map(volumes.map(v => [v.id, v.title]))
  const queueGroups = groupQueue(queue, volumeTitles)

  // One cover per series, however many of its issues are queued
  const queueCoverItems = queueGroups.map(g => ({
    coverUrl: `/api/kapowarr/${integId}/cover/${g.volumeId}`,
    title: g.count > 1 ? `${g.title} — ${g.count} issues` : g.title,
    linkUrl: uiUrl ? `${uiUrl}/volumes/${g.volumeId}` : undefined,
  }))

  // ── 1x: icon + stats ──────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>🗞️</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x–3x: stats + cover strip ────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {coverItems.length > 0 && <AuthCoverStrip items={coverItems} height={80} />}
    </div>
  )

  // ── 4x+: library strip + downloading strip + queue list ──────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 3 }}>Library</div>
          <AuthCoverStrip items={coverItems} height={72} />
        </div>
        {queueCoverItems.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 3 }}>Downloading</div>
            <AuthCoverStrip items={queueCoverItems} height={72} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {queue.length > 0 ? (
          <>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
              Queue ({queue.length})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {queueGroups.map(g => <QueueGroupRow key={g.volumeId} group={g} uiUrl={uiUrl} />)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Volumes</div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {volumes.map((v, i) => <VolumeRow key={i} vol={v} uiUrl={uiUrl} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
