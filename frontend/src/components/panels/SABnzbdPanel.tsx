import { useState, useEffect, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface SABSlot {
  filename: string
  percentage: number
  mb: number
  mbleft: number
  timeleft: string
  status: string
  category: string
  avgAge: string
}

interface SABHistorySlot {
  name: string
  status: string
  size: string
  completed: number
  failMessage: string
}

interface NZBPeriodStats {
  downloadedGb: number
  completed: number
  failed: number
}

interface SABData {
  uiUrl: string
  integrationId: string
  speed: string
  speedKbps: number
  mbLeft: number
  timeLeft: string
  status: string
  paused: boolean
  queueCount: number
  downloading: number
  queued: number
  pausedCount: number
  failed: number
  freeDiskGb: number
  speedHistory: number[]
  stats1d: NZBPeriodStats
  stats7d: NZBPeriodStats
  stats30d: NZBPeriodStats
  slots: SABSlot[]
  history: SABHistorySlot[]
}

type Period = '1d' | '7d' | '30d'

function fmtSpeed(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`
  if (kbps > 0) return `${kbps.toFixed(0)} KB/s`
  return '0 KB/s'
}

function fmtMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(0)} MB`
}

function fmtGB(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(gb * 1024).toFixed(0)} MB`
}

function dotColor(status: string, paused: boolean): string {
  if (paused) return 'var(--amber)'
  const l = status.toLowerCase()
  if (l === 'downloading') return 'var(--green)'
  return 'var(--text-dim)'
}

function histIcon(s: string): { icon: string; color: string } {
  const l = s.toLowerCase()
  if (l === 'completed') return { icon: '✓', color: 'var(--green)' }
  if (l === 'failed') return { icon: '✗', color: 'var(--red)' }
  return { icon: '↻', color: 'var(--amber)' }
}

function CatBadge({ cat }: { cat: string }) {
  if (!cat) return null
  const colors: Record<string, string> = {
    tv: '#6366f1', movies: '#f59e0b', music: '#22c55e',
    books: '#14b8a6', software: '#06b6d4', games: '#a855f7', xxx: '#ec4899',
  }
  const bg = colors[cat.toLowerCase()] ?? '#6b7280'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
      background: bg + '28', color: bg, textTransform: 'uppercase',
      letterSpacing: '0.05em', flexShrink: 0,
    }}>
      {cat}
    </span>
  )
}

function DonutChart({ downloading, queued, paused, failed }: {
  downloading: number; queued: number; paused: number; failed: number
}) {
  const total = downloading + queued + paused + failed
  const r = 14, cx = 17, cy = 17, circ = 2 * Math.PI * r
  if (total === 0) {
    return (
      <svg width="34" height="34" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth="5" />
      </svg>
    )
  }
  const segs = [
    { count: downloading, color: 'var(--green)' },
    { count: queued, color: 'var(--accent)' },
    { count: paused, color: 'var(--amber)' },
    { count: failed, color: 'var(--red)' },
  ]
  let offset = 0
  return (
    <svg width="34" height="34" style={{ flexShrink: 0 }}>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segs.map((seg, i) => {
          if (seg.count === 0) return null
          const dash = (seg.count / total) * circ
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={seg.color} strokeWidth="5"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset} />
          )
          offset += dash
          return el
        })}
      </g>
    </svg>
  )
}

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null
  const w = 200, h = 28
  const max = Math.max(...data, 0.01)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * h * 0.9 - h * 0.05
    return `${x},${y}`
  })
  const line = pts.join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ display: 'block', marginTop: 4 }}>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="var(--green)" opacity="0.12" />
      <polyline points={line} fill="none" stroke="var(--green)"
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function PeriodPills({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['1d', '7d', '30d'] as Period[]).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: '2px 8px', borderRadius: 4, lineHeight: '16px',
          border: `1px solid ${value === p ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--surface2)',
          color: value === p ? 'var(--accent)' : 'var(--text-dim)',
          fontSize: 10, fontWeight: 700, cursor: 'pointer',
        }}>
          {p}
        </button>
      ))}
    </div>
  )
}

function SlotRow({ slot }: { slot: SABSlot }) {
  const pct = Math.min(Math.max(slot.percentage, 0), 100)
  const barColor = slot.status.toLowerCase() === 'paused' ? 'var(--amber)'
    : 'var(--accent)'
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <CatBadge cat={slot.category} />
        <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', fontWeight: 500 }} title={slot.filename}>
          {slot.filename}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {pct.toFixed(0)}%
        </span>
        {slot.timeleft && slot.timeleft !== '0:00:00' && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
            fontFamily: 'DM Mono, monospace' }}>
            {slot.timeleft}
          </span>
        )}
      </div>
      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor,
          borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function HistRow({ h }: { h: SABHistorySlot }) {
  const { icon, color } = histIcon(h.status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color, flexShrink: 0, fontWeight: 700 }}>{icon}</span>
      <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={h.name}>
        {h.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {h.size}
      </span>
    </div>
  )
}

export default function SABnzbdPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<SABData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('7d')

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<SABData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  )
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4,
      color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  )
  if (!data) return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const isActive = data.speedKbps > 0
  const slots = data.slots || []
  const history = data.history || []
  const speedHistory = data.speedHistory || []
  const statusLabel = data.paused ? 'Paused' : (data.status || 'Idle')
  const color = dotColor(data.status, data.paused)
  const periodStats = period === '1d' ? data.stats1d : period === '7d' ? data.stats7d : data.stats30d

  const queueTotal = (data.downloading ?? 0) + (data.queued ?? 0) + (data.pausedCount ?? 0) + (data.failed ?? 0)
  const donut = queueTotal > 0
    ? { downloading: data.downloading ?? 0, queued: data.queued ?? 0, paused: data.pausedCount ?? 0, failed: data.failed ?? 0 }
    : { downloading: periodStats?.completed ?? 0, queued: 0, paused: 0, failed: periodStats?.failed ?? 0 }

  const sectionHeader = (label: string, count?: number) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      marginBottom: 6, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      {label}
      {count != null && (
        <span style={{ background: 'var(--surface2)', borderRadius: 8, padding: '0 5px',
          fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>
          {count}
        </span>
      )}
    </div>
  )

  const Summary = () => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit', flexShrink: 0, marginTop: 2 }}>
        <DonutChart {...donut} />
      </a>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20,
          color: isActive ? 'var(--green)' : 'var(--text-dim)', lineHeight: 1, marginBottom: 4 }}>
          ↓ {fmtSpeed(data.speedKbps)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color, fontWeight: 600 }}>{statusLabel}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11,
          color: 'var(--text-dim)' }}>
          {data.queueCount > 0 && (
            <span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
                color: 'var(--text-muted)' }}>
                {data.queueCount}
              </span>{' queued'}
            </span>
          )}
          {data.mbLeft > 0 && (
            <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
              {fmtMB(data.mbLeft)}
              {data.timeLeft && data.timeLeft !== '0:00:00' && ` · ${data.timeLeft}`}
            </span>
          )}
          {data.freeDiskGb > 0 && (
            <span style={{ color: 'var(--text-dim)' }}>
              ∥ {fmtGB(data.freeDiskGb)} free
            </span>
          )}
        </div>
      </div>
    </div>
  )

  const PeriodStats = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Stats
        </div>
        <PeriodPills value={period} onChange={setPeriod} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 6px',
        marginBottom: 4 }}>
        {[
          { label: 'Downloaded', value: fmtGB(periodStats?.downloadedGb ?? 0) },
          { label: 'Completed', value: String(periodStats?.completed ?? 0) },
          { label: 'Failed', value: String(periodStats?.failed ?? 0) },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 700,
              color: 'var(--text-muted)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </>
  )

  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Summary />
    </div>
  )

  if (heightUnits <= 2) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {speedHistory.length >= 2 && <Sparkline data={speedHistory} />}
      {sectionHeader('Queue', slots.length)}
      {slots.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Queue is empty</div>
        : slots.slice(0, 6).map((s, i) => <SlotRow key={i} slot={s} />)
      }
      {slots.length > 6 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>+{slots.length - 6} more</div>
      )}
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {speedHistory.length >= 2 && <Sparkline data={speedHistory} />}
      <PeriodStats />
      {sectionHeader('Queue', slots.length)}
      {slots.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Queue is empty</div>
        : slots.slice(0, 6).map((s, i) => <SlotRow key={i} slot={s} />)
      }
      {slots.length > 6 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
          +{slots.length - 6} more
        </div>
      )}
      {heightUnits >= 4 && history.length > 0 && (
        <>
          {sectionHeader('History', history.length)}
          {history.slice(0, 10).map((h, i) => <HistRow key={i} h={h} />)}
        </>
      )}
    </div>
  )
}
