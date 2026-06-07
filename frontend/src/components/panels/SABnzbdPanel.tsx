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
  slots: SABSlot[]
  history: SABHistorySlot[]
}

// Format KB/s → human speed string
function fmtSpeed(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`
  if (kbps > 0) return `${kbps.toFixed(0)} KB/s`
  return '0 KB/s'
}

// Format MB → human size
function fmtMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(0)} MB`
}

function statusColor(s: string): string {
  const l = s.toLowerCase()
  if (l === 'downloading') return 'var(--green)'
  if (l === 'paused') return 'var(--amber)'
  if (l === 'idle' || l === 'no active downloads') return 'var(--text-dim)'
  return 'var(--text-muted)'
}

function histStatusIcon(s: string): { icon: string; color: string } {
  const l = s.toLowerCase()
  if (l === 'completed') return { icon: '✓', color: 'var(--green)' }
  if (l === 'failed') return { icon: '✗', color: 'var(--red)' }
  return { icon: '↻', color: 'var(--amber)' }
}

// Category badge with soft color
function CatBadge({ cat }: { cat: string }) {
  if (!cat) return null
  const colors: Record<string, string> = {
    tv: '#6366f1', movies: '#f59e0b', music: '#22c55e',
    books: '#14b8a6', software: '#06b6d4', games: '#a855f7',
    xxx: '#ec4899',
  }
  const bg = colors[cat.toLowerCase()] ?? '#6b7280'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
      background: bg + '28', color: bg, textTransform: 'uppercase', letterSpacing: '0.05em',
      flexShrink: 0,
    }}>
      {cat}
    </span>
  )
}

// Progress bar row for a queue slot
function SlotRow({ slot }: { slot: SABSlot }) {
  const pct = Math.min(Math.max(slot.percentage, 0), 100)
  const isDownloading = slot.status.toLowerCase() === 'downloading'
  const barColor = slot.status.toLowerCase() === 'paused'
    ? 'var(--amber)'
    : isDownloading ? 'var(--accent)' : 'var(--text-dim)'

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
        {slot.mbleft > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
            fontFamily: 'DM Mono, monospace' }}>
            {fmtMB(slot.mbleft)}
          </span>
        )}
      </div>
      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: barColor,
          borderRadius: 2, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// History slot row
function HistRow({ h }: { h: SABHistorySlot }) {
  const { icon, color } = histStatusIcon(h.status)
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

  const section = (label: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, marginTop: 10 }}>
      {label}
    </div>
  )

  // ── Header bar ─────────────────────────────────────────────────────────────
  const Header = ({ large = false }: { large?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {/* Speed chip — links to UI */}
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: large ? '4px 12px' : '3px 10px',
          borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)',
          textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
        <span style={{ fontSize: large ? 13 : 11, color: 'var(--text-dim)' }}>↓</span>
        <span style={{
          fontFamily: 'DM Mono, monospace',
          fontWeight: 700,
          fontSize: large ? 18 : 13,
          color: isActive ? 'var(--green)' : 'var(--text-dim)',
        }}>
          {fmtSpeed(data.speedKbps)}
        </span>
      </a>

      {/* Status chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 6,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        fontSize: 11,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: statusColor(data.status) }} />
        <span style={{ color: statusColor(data.status), fontWeight: 600 }}>
          {data.paused ? 'Paused' : data.status}
        </span>
      </div>

      {/* Queue count chip */}
      {data.queueCount > 0 && (
        <div style={{ padding: '3px 9px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {data.queueCount}
          </span>
          <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>queued</span>
        </div>
      )}

      {/* MB left + time left */}
      {data.mbLeft > 0 && (
        <div style={{ padding: '3px 9px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {fmtMB(data.mbLeft)}
          </span>
          {data.timeLeft && data.timeLeft !== '0:00:00' && (
            <span style={{ color: 'var(--text-dim)', marginLeft: 5 }}>
              · {data.timeLeft}
            </span>
          )}
        </div>
      )}
    </div>
  )

  // ── 1x: just the header bar ─────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Header />
    </div>
  )

  // ── 2-3x: header + queue slots ──────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <Header large />
      {section('Queue')}
      {slots.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Queue is empty</div>
        : slots.map((s, i) => <SlotRow key={i} slot={s} />)
      }
    </div>
  )

  // ── 4x+: two-column layout ──────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', gap: 16 }}>
      {/* Left: speed stats + aggregate bar */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
        overflow: 'auto' }}>
        {/* Big speed display */}
        <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: 4 }}>Download speed</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700,
              fontSize: 28, color: isActive ? 'var(--green)' : 'var(--text-dim)',
              lineHeight: 1 }}>
              {fmtSpeed(data.speedKbps)}
            </div>
          </div>
        </a>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%',
            background: statusColor(data.status) }} />
          <span style={{ fontSize: 12, color: statusColor(data.status), fontWeight: 600 }}>
            {data.paused ? 'Paused' : data.status}
          </span>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px',
          marginBottom: 16 }}>
          {[
            { label: 'Queued', value: String(data.queueCount) },
            { label: 'Remaining', value: data.mbLeft > 0 ? fmtMB(data.mbLeft) : '—' },
            { label: 'Time left', value: (data.timeLeft && data.timeLeft !== '0:00:00') ? data.timeLeft : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 1 }}>{label}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* History section */}
        {history.length > 0 && (
          <>
            {section('Recent history')}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {history.slice(0, 6).map((h, i) => <HistRow key={i} h={h} />)}
            </div>
          </>
        )}
      </div>

      {/* Right: queue slots */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {section('Queue')}
        {slots.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Queue is empty</div>
          : slots.map((s, i) => <SlotRow key={i} slot={s} />)
        }
        {slots.length > 0 && history.length > 0 && (
          <>
            {section('History')}
            {history.slice(0, 10).map((h, i) => <HistRow key={i} h={h} />)}
          </>
        )}
      </div>
    </div>
  )
}
