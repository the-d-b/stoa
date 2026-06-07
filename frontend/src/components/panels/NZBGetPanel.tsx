import { useState, useEffect, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface NZBGetGroup {
  name: string
  status: string
  category: string
  percentage: number
  sizeMb: number
  remainMb: number
  paused: boolean
}

interface NZBGetHistory {
  name: string
  status: string
  category: string
  sizeMb: number
}

interface NZBGetData {
  uiUrl: string
  integrationId: string
  speedBps: number
  remainMb: number
  downloadedMb: number
  freeDiskMb: number
  paused: boolean
  queueCount: number
  groups: NZBGetGroup[]
  history: NZBGetHistory[]
}

function fmtBPS(bps: number): string {
  const mb = bps / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`
  const kb = bps / 1024
  if (kb >= 1) return `${kb.toFixed(0)} KB/s`
  return '0 KB/s'
}

function fmtMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(0)} MB`
}

function histIcon(s: string): { icon: string; color: string } {
  const l = s.toUpperCase()
  if (l === 'SUCCESS') return { icon: '✓', color: 'var(--green)' }
  if (l === 'FAILURE' || l === 'DELETED') return { icon: '✗', color: 'var(--red)' }
  return { icon: '↻', color: 'var(--amber)' }
}

function CatBadge({ cat }: { cat: string }) {
  if (!cat) return null
  const colors: Record<string, string> = {
    tv: '#6366f1', movies: '#f59e0b', music: '#22c55e',
    books: '#14b8a6', software: '#06b6d4', games: '#a855f7',
    nzb: '#6b7280',
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

function GroupRow({ g }: { g: NZBGetGroup }) {
  const pct = Math.min(Math.max(g.percentage, 0), 100)
  const barColor = g.paused ? 'var(--amber)'
    : g.status.toUpperCase() === 'DOWNLOADING' ? 'var(--accent)'
    : 'var(--surface2)'

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <CatBadge cat={g.category} />
        <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', fontWeight: 500 }} title={g.name}>
          {g.name}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {pct}%
        </span>
        {g.remainMb > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
            fontFamily: 'DM Mono, monospace' }}>
            {fmtMB(g.remainMb)}
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

function HistRow({ h }: { h: NZBGetHistory }) {
  const { icon, color } = histIcon(h.status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color, flexShrink: 0, fontWeight: 700 }}>{icon}</span>
      <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={h.name}>
        {h.name}
      </span>
      {h.sizeMb > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {fmtMB(h.sizeMb)}
        </span>
      )}
    </div>
  )
}

export default function NZBGetPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<NZBGetData | null>(null)
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

  const sseData = useSSE<NZBGetData>(integrationId)
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
  const isActive = data.speedBps > 0
  const groups = data.groups || []
  const history = data.history || []

  const section = (label: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, marginTop: 10 }}>
      {label}
    </div>
  )

  const statusLabel = data.paused ? 'Paused' : isActive ? 'Downloading' : 'Idle'
  const statusColor = data.paused ? 'var(--amber)'
    : isActive ? 'var(--green)' : 'var(--text-dim)'

  // ── Header ─────────────────────────────────────────────────────────────────
  const Header = ({ large = false }: { large?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: large ? '4px 12px' : '3px 10px',
          borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)',
          textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
        <span style={{ fontSize: large ? 13 : 11, color: 'var(--text-dim)' }}>↓</span>
        <span style={{
          fontFamily: 'DM Mono, monospace', fontWeight: 700,
          fontSize: large ? 18 : 13,
          color: isActive ? 'var(--green)' : 'var(--text-dim)',
        }}>
          {fmtBPS(data.speedBps)}
        </span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 6,
        background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%',
          background: statusColor, flexShrink: 0 }} />
        <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
      </div>

      {groups.length > 0 && (
        <div style={{ padding: '3px 9px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {groups.length}
          </span>
          <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>queued</span>
        </div>
      )}

      {data.remainMb > 0 && (
        <div style={{ padding: '3px 9px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {fmtMB(data.remainMb)}
          </span>
          <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>left</span>
        </div>
      )}
    </div>
  )

  // ── 1x ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Header />
    </div>
  )

  // ── 2-3x ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header large />
      {section('Queue')}
      {groups.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Queue is empty</div>
        : groups.map((g, i) => <GroupRow key={i} g={g} />)
      }
    </div>
  )

  // ── 4x+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', gap: 16 }}>
      {/* Left: stats + history */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
        overflow: 'auto' }}>
        <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: 4 }}>Download speed</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700,
              fontSize: 28, color: isActive ? 'var(--green)' : 'var(--text-dim)', lineHeight: 1 }}>
              {fmtBPS(data.speedBps)}
            </div>
          </div>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px',
          marginBottom: 16 }}>
          {[
            { label: 'Queued', value: String(groups.length) },
            { label: 'Remaining', value: data.remainMb > 0 ? fmtMB(data.remainMb) : '—' },
            { label: "Today's DL", value: data.downloadedMb > 0 ? fmtMB(data.downloadedMb) : '—' },
            { label: 'Free disk', value: data.freeDiskMb > 0 ? fmtMB(data.freeDiskMb) : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 1 }}>{label}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <>
            {section('Recent history')}
            {history.slice(0, 6).map((h, i) => <HistRow key={i} h={h} />)}
          </>
        )}
      </div>

      {/* Right: queue */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {section('Queue')}
        {groups.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Queue is empty</div>
          : groups.map((g, i) => <GroupRow key={i} g={g} />)
        }
        {groups.length > 0 && history.length > 0 && (
          <>
            {section('History')}
            {history.slice(0, 10).map((h, i) => <HistRow key={i} h={h} />)}
          </>
        )}
      </div>
    </div>
  )
}
