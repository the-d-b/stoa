import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface TransmissionTracker { host: string; count: number }
interface TransmissionTorrent {
  name: string; status: number; progress: number
  sizeMb: number; downMbps: number; upMbps: number; eta: number; ratio: number
}
interface TransmissionData {
  uiUrl: string
  downloading: number; seeding: number; paused: number; checking: number
  downSpeedMbps: number; upSpeedMbps: number
  seedSizeGB: number; freeSpaceGB: number
  trackers: TransmissionTracker[]
  active: TransmissionTorrent[]
  seedingList: TransmissionTorrent[]
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

function fmtETA(secs: number) {
  if (secs < 0) return '∞'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

function ratioColor(r: number) {
  if (r >= 1.0) return 'var(--green)'
  if (r >= 0.5) return 'var(--amber)'
  return 'var(--text-dim)'
}

const DISPLAY_LIMIT = 6

export default function TransmissionPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TransmissionData | null>(null)
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

  const sseData = useSSE<TransmissionData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const total = data.downloading + data.seeding + data.paused + data.checking

  // ── Donut chart ───────────────────────────────────────────────────────────
  const DonutChart = () => {
    if (total === 0) return null
    const size = 34, cx = 17, cy = 17, r = 12, sw = 5
    const circ = 2 * Math.PI * r
    const segs = [
      { n: data.seeding,     c: 'var(--amber)' },
      { n: data.downloading, c: 'var(--green)' },
      { n: data.checking,    c: '#7c8cff' },
      { n: data.paused,      c: 'var(--border)' },
    ].filter(s => s.n > 0)
    let cum = 0
    return (
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={sw} />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {segs.map((seg, i) => {
            const len = (seg.n / total) * circ
            const el = (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={seg.c} strokeWidth={sw}
                strokeDasharray={`${len} ${circ}`}
                strokeDashoffset={-cum} />
            )
            cum += len
            return el
          })}
        </g>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: 8, fill: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
          {total}
        </text>
      </svg>
    )
  }

  // ── Section header ────────────────────────────────────────────────────────
  const SectionTitle = ({ text }: { text: string }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Speed + status summary ────────────────────────────────────────────────
  const Summary = () => (
    <div style={{ display: 'flex', gap: 5, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <DonutChart />
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
        {data.downloading > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--green)30', fontSize: 11 }}>
            <span style={{ color: 'var(--green)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.downloading}</span>
            <span style={{ color: 'var(--text-dim)' }}>↓</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.seeding}</span>
          <span style={{ color: 'var(--amber)', opacity: 0.7 }}>↑</span>
        </div>
        {data.paused > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, opacity: 0.6 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.paused}</span>
            <span style={{ color: 'var(--text-dim)' }}>⏸</span>
          </div>
        )}
        {data.checking > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, opacity: 0.7 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.checking}</span>
            <span style={{ color: '#7c8cff', fontSize: 9 }}>CHK</span>
          </div>
        )}
      </div>
      {data.freeSpaceGB > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
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
    const all = data.active || []
    const items = all.slice(0, DISPLAY_LIMIT)
    if (items.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nothing active</div>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((t, i) => {
          const isSeeding = t.status === 6
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', fontWeight: 500 }} title={t.name}>{t.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                  {t.progress.toFixed(0)}%
                </span>
                {t.downMbps > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--green)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                    ↓ {fmtSpeed(t.downMbps)}
                  </span>
                )}
                {t.upMbps > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--amber)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                    ↑ {fmtSpeed(t.upMbps)}
                  </span>
                )}
                {isSeeding && t.ratio > 0 && (
                  <span style={{ fontSize: 10, color: ratioColor(t.ratio), flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                    {t.ratio.toFixed(2)}
                  </span>
                )}
                {!isSeeding && t.eta > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                    {fmtETA(t.eta)}
                  </span>
                )}
              </div>
              <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2 }}>
                <div style={{ width: `${Math.min(t.progress, 100)}%`, height: '100%',
                  background: isSeeding ? 'var(--amber)' : 'var(--accent)', borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
        {all.length > DISPLAY_LIMIT && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>
            +{all.length - DISPLAY_LIMIT} more
          </div>
        )}
      </div>
    )
  }

  // ── Seeding list (4x) ─────────────────────────────────────────────────────
  const SeedingSection = () => {
    const all = data.seedingList || []
    if (all.length === 0 && data.seeding === 0) return null
    const items = all.slice(0, DISPLAY_LIMIT)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
              background: t.upMbps > 0 ? 'var(--amber)' : 'var(--border)' }} />
            <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' }} title={t.name}>{t.name}</span>
            {t.upMbps > 0 && (
              <span style={{ fontSize: 10, color: 'var(--amber)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                ↑ {fmtSpeed(t.upMbps)}
              </span>
            )}
            <span style={{ fontSize: 10, color: ratioColor(t.ratio), flexShrink: 0,
              fontFamily: 'DM Mono, monospace', minWidth: 28, textAlign: 'right' }}>
              {t.ratio.toFixed(2)}
            </span>
          </div>
        ))}
        {all.length > DISPLAY_LIMIT && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', paddingLeft: 12 }}>
            +{all.length - DISPLAY_LIMIT} more
          </div>
        )}
        {data.seedSizeGB > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', paddingLeft: 12, marginTop: 2,
            fontFamily: 'DM Mono, monospace' }}>
            Total: {fmtSize(data.seedSizeGB)}
          </div>
        )}
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
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
            Total seeding: {fmtSize(data.seedSizeGB)}
          </div>
        )}
      </div>
    )
  }

  const activeCount = (data.active || []).length

  // ── 1x ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Summary />
    </div>
  )

  // ── 2x ───────────────────────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      <SectionTitle text={`Active Torrents${activeCount > 0 ? ` (${activeCount})` : ''}`} />
      <ActiveList />
    </div>
  )

  // ── 4x ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      <SectionTitle text={`Active Torrents${activeCount > 0 ? ` (${activeCount})` : ''}`} />
      <ActiveList />
      <SectionTitle text={`Seeding${data.seeding > 0 ? ` (${data.seeding})` : ''}`} />
      <SeedingSection />
      {(data.trackers || []).length > 0 && (
        <>
          <SectionTitle text="By Tracker" />
          <TrackerList />
        </>
      )}
    </div>
  )
}
