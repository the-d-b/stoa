import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface AuthentikFailure { username: string; clientIp: string; createdAt: string }
interface AuthentikData {
  uiUrl: string
  loginsTotal: number; loginsToday: number
  failuresTotal: number; failuresToday: number
  activeSessions: number
  recentFailures: AuthentikFailure[]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AuthentikPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<AuthentikData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 120

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const hasRecentFailures = (data.recentFailures || []).length > 0
  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Summary pills ────────────────────────────────────────────────────────
  const Summary = () => (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {/* Logins */}
      <a href={uiUrl ? `${uiUrl}/if/admin/#/events/list?action=login` : '#'}
        target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11, textDecoration: 'none', color: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <span style={{ color: 'var(--green)' }}>✓</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{data.loginsTotal.toLocaleString()}</span>
        <span style={{ color: 'var(--text-dim)' }}>logins</span>
        {data.loginsToday > 0 && (
          <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'DM Mono, monospace' }}>
            +{data.loginsToday} today
          </span>
        )}
      </a>
      {/* Failures */}
      <a href={uiUrl ? `${uiUrl}/if/admin/#/events/list?action=login_failed` : '#'}
        target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 6, background: 'var(--surface2)',
          border: `1px solid ${data.failuresToday > 5 ? 'var(--red)' : 'var(--border)'}`,
          fontSize: 11, textDecoration: 'none', color: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = data.failuresToday > 5 ? 'var(--red)' : 'var(--border)'}>
        <span style={{ color: data.failuresTotal > 0 ? 'var(--red)' : 'var(--text-dim)' }}>✗</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700,
          color: data.failuresTotal > 0 ? 'var(--red)' : 'inherit' }}>{data.failuresTotal.toLocaleString()}</span>
        <span style={{ color: 'var(--text-dim)' }}>failed</span>
        {data.failuresToday > 0 && (
          <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'DM Mono, monospace' }}>
            +{data.failuresToday} today
          </span>
        )}
      </a>
      {/* Sessions */}
      {data.activeSessions > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>⚡</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{data.activeSessions}</span>
          <span style={{ color: 'var(--text-dim)' }}>sessions</span>
        </div>
      )}
    </div>
  )

  // ── Recent failures list ──────────────────────────────────────────────────
  const FailureList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {(data.recentFailures || []).map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '3px 8px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--red)', flexShrink: 0 }}>✗</span>
          <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.username || '?'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)',
            fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{f.clientIp}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)',
            flexShrink: 0 }}>{timeAgo(f.createdAt)}</span>
        </div>
      ))}
    </div>
  )

  // ── 1x — summary pills only ───────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Summary />
    </div>
  )

  // ── 2x and larger — summary + recent failures ─────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {hasRecentFailures && (
        <>
          {sectionTitle('Recent failures')}
          <FailureList />
        </>
      )}
      {!hasRecentFailures && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)' }}>
          ✓ No recent failed login attempts
        </div>
      )}
    </div>
  )
}
