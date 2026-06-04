import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface QBTTracker { host: string; count: number }
interface QBTTorrent {
  name: string; state: string; progress: number
  sizeMb: number; downMbps: number; upMbps: number; eta: number; ratio: number
}
interface QBTData {
  uiUrl: string
  downloading: number; seeding: number; paused: number; checking: number; errored: number
  downSpeedMbps: number; upSpeedMbps: number
  seedSizeGB: number; freeSpaceGB: number
  trackers: QBTTracker[]
  active: QBTTorrent[]
}

function fmtSpeed(mbps: number) {
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  if (mbps > 0) return `${(mbps * 1000).toFixed(0)} KB/s`
  return '0'
}

function fmtSize(gb: number) {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  return `${gb.toFixed(0)} GB`
}

// qBittorrent uses 8640000 (100 days) to signal "no ETA" instead of -1
function fmtETA(secs: number) {
  if (secs < 0 || secs >= 8640000) return '∞'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

function barColor(state: string) {
  if (state === 'uploading' || state === 'forceUP') return 'var(--amber)'
  if (state === 'metaDL') return 'var(--text-dim)'
  return 'var(--accent)'
}

export default function QBittorrentPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<QBTData | null>(null)
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

  const sseData = useSSE<QBTData>(integrationId)
  useEffect(() => {
    if (sseData !== null) setData(sseData)
  }, [sseData])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Speed + status summary ────────────────────────────────────────────────
  const Summary = () => (
    <div style={{ display: 'flex', gap: 5, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Speed pill — links to qBittorrent Web UI */}
        <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, textDecoration: 'none', color: 'inherit' }}>
          ↓ <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
            color: data.downSpeedMbps > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
            {fmtSpeed(data.downSpeedMbps)}
          </span>
          <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>·</span>
          ↑ <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
            color: data.upSpeedMbps > 0 ? 'var(--amber)' : 'var(--text-dim)' }}>
            {fmtSpeed(data.upSpeedMbps)}
          </span>
        </a>
        {/* Downloading count */}
        {data.downloading > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--green)30',
            fontSize: 11 }}>
            <span style={{ color: 'var(--green)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
              {data.downloading}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>↓</span>
          </div>
        )}
        {/* Seeding count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.seeding}</span>
          <span style={{ color: 'var(--text-dim)' }}>↑</span>
        </div>
        {/* Paused count */}
        {data.paused > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, opacity: 0.6 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.paused}</span>
            <span style={{ color: 'var(--text-dim)' }}>⏸</span>
          </div>
        )}
        {/* Error count — shown in red when non-zero */}
        {data.errored > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: '#f8717118', border: '1px solid #f8717130',
            fontSize: 11 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--red)' }}>
              {data.errored}
            </span>
            <span style={{ color: 'var(--red)' }}>✕</span>
          </div>
        )}
      </div>
      {/* Free space */}
      {data.freeSpaceGB > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>free</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
            color: data.freeSpaceGB < 50 ? 'var(--amber)' : 'var(--text)' }}>
            {fmtSize(data.freeSpaceGB)}
          </span>
        </div>
      )}
    </div>
  )

  // ── Active torrent list ───────────────────────────────────────────────────
  const ActiveList = () => {
    const items = data.active || []
    if (items.length === 0) return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nothing active</div>
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((t, i) => {
          const isSeeding = t.state === 'uploading' || t.state === 'forceUP'
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', fontWeight: 500 }} title={t.name}>{t.name}</span>
                {t.state === 'metaDL' && (
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>metadata</span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                  fontFamily: 'DM Mono, monospace' }}>
                  {t.progress.toFixed(0)}%
                </span>
                {t.downMbps > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--green)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>↓ {fmtSpeed(t.downMbps)}</span>
                )}
                {t.upMbps > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--amber)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>↑ {fmtSpeed(t.upMbps)}</span>
                )}
                {isSeeding && t.ratio > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>{t.ratio.toFixed(2)}</span>
                )}
                {!isSeeding && t.eta > 0 && t.eta < 8640000 && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>{fmtETA(t.eta)}</span>
                )}
              </div>
              <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2 }}>
                <div style={{ width: `${Math.min(t.progress, 100)}%`, height: '100%',
                  background: barColor(t.state), borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Tracker breakdown ─────────────────────────────────────────────────────
  const TrackerList = () => {
    const trackers = (data.trackers || []).slice(0, 8)
    if (trackers.length === 0) return null
    const max = trackers[0]?.count || 1
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {trackers.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.host}
            </span>
            <div style={{ width: 60, height: 3, background: 'var(--surface2)', borderRadius: 2 }}>
              <div style={{ width: `${(t.count / max) * 100}%`, height: '100%',
                background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace', width: 24, textAlign: 'right' }}>
              {t.count}
            </span>
          </div>
        ))}
        {data.seedSizeGB > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4,
            fontFamily: 'DM Mono, monospace' }}>
            Total seeding: {fmtSize(data.seedSizeGB)}
          </div>
        )}
      </div>
    )
  }

  // ── 1x — speed + counts ───────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Summary />
    </div>
  )

  // ── 2x — summary + active list ───────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {sectionTitle('Active torrents')}
      <ActiveList />
    </div>
  )

  // ── 4x — summary + active + tracker breakdown ─────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {sectionTitle('Active torrents')}
      <ActiveList />
      {(data.trackers || []).length > 0 && (
        <>
          {sectionTitle('By tracker')}
          <TrackerList />
        </>
      )}
    </div>
  )
}
