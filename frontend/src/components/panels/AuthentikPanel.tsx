import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface AuthentikFailure { username: string; clientIp: string; createdAt: string }
interface AuthentikData {
  uiUrl: string; days: number
  logins: number; failures: number; activeSessions: number
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

const DAY_OPTIONS = [
  { label: '1d',  days: 1 },
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '∞',   days: 36500 },
]

function Donut({ logins, failures }: { logins: number; failures: number }) {
  const total = logins + failures
  if (total === 0) return null

  const r = 38
  const cx = 56
  const cy = 56
  const strokeW = 16
  const C = 2 * Math.PI * r
  const successLen = (logins / total) * C
  const failLen    = (failures / total) * C
  const failPct    = Math.round((failures / total) * 100)

  return (
    <svg width={112} height={112} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={strokeW} />
      {/* Success arc — starts at 12 o'clock via rotate(-90) */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--green)" strokeWidth={strokeW}
        strokeDasharray={`${successLen} ${C - successLen}`}
        strokeDashoffset={0}
        transform={`rotate(-90, ${cx}, ${cy})`} />
      {/* Failure arc — offset by successLen so it begins right after */}
      {failLen > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--red)" strokeWidth={strokeW}
          strokeDasharray={`${failLen} ${C - failLen}`}
          strokeDashoffset={-successLen}
          transform={`rotate(-90, ${cx}, ${cy})`} />
      )}
      {/* Centre: total */}
      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
        fontSize={17} fontWeight={700} fill="var(--text)"
        fontFamily="DM Mono, monospace">{total.toLocaleString()}</text>
      <text x={cx} y={cy + 11} textAnchor="middle"
        fontSize={9} fill="var(--text-dim)">total logins</text>
      {failures > 0 && (
        <text x={cx} y={cy + 24} textAnchor="middle"
          fontSize={9} fontWeight={600} fill="var(--red)">{failPct}% failed</text>
      )}
      {failures === 0 && (
        <text x={cx} y={cy + 24} textAnchor="middle"
          fontSize={9} fill="var(--green)">all ok</text>
      )}
    </svg>
  )
}

export default function AuthentikPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<AuthentikData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined
  const [days, setDays] = useState<number>(config.days || 7)

  const loadSeqRef = useRef(0)
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    try {
      const res = await integrationsApi.getPanelData(panel.id, { days })
      if (seq !== loadSeqRef.current) return  // stale — a newer load superseded this one
      setData(res.data); setError('')
    } catch (e: any) {
      if (seq !== loadSeqRef.current) return
      setError(e.response?.data?.error || 'Failed to load')
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [panel.id, days])

  // SSE signal: re-fetch when the worker pushes fresh data.
  // The cascade that caused flickering is fixed on the backend — override requests
  // no longer call cacheSet, so this load() won't trigger another SSE broadcast.
  const sseSignal = useSSE<AuthentikData>(integrationId)
  useEffect(() => {
    if (sseSignal !== null) load()
  }, [sseSignal, load])

  useEffect(() => { load() }, [load])

  if (error) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data && loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (!data) return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const hasFailures = (data.recentFailures || []).length > 0
  const alerting = data.failures > 10

  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a href={uiUrl ? `${uiUrl}/if/admin/#/events/list?action=login` : '#'}
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, textDecoration: 'none', color: 'inherit' }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          <span style={{ color: 'var(--green)' }}>✓</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{(data.logins ?? 0).toLocaleString()}</span>
          <span style={{ color: 'var(--text-dim)' }}>logins</span>
        </a>
        <a href={uiUrl ? `${uiUrl}/if/admin/#/events/list?action=login_failed` : '#'}
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)',
            border: `1px solid ${alerting ? 'var(--red)' : 'var(--border)'}`,
            fontSize: 11, textDecoration: 'none', color: 'inherit' }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = alerting ? 'var(--red)' : 'var(--border)'}>
          <span style={{ color: (data.failures ?? 0) > 0 ? 'var(--red)' : 'var(--text-dim)' }}>✗</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700,
            color: (data.failures ?? 0) > 0 ? 'var(--red)' : 'inherit' }}>{(data.failures ?? 0).toLocaleString()}</span>
          <span style={{ color: 'var(--text-dim)' }}>failed</span>
        </a>
        {data.activeSessions > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>⚡</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{data.activeSessions}</span>
            <span style={{ color: 'var(--text-dim)' }}>sessions</span>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Donut chart — 4x+ only */}
      {heightUnits >= 4 && (
        <div style={{ marginBottom: 8 }}>
          <Donut logins={data.logins ?? 0} failures={data.failures ?? 0} />
        </div>
      )}

      {/* Time range pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
        {DAY_OPTIONS.map(opt => (
          <button key={opt.days} onClick={() => setDays(opt.days)}
            style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
              fontWeight: days === opt.days ? 700 : 400,
              background: days === opt.days ? 'var(--accent)' : 'var(--surface2)',
              color: days === opt.days ? '#fff' : 'var(--text-dim)',
              border: `1px solid ${days === opt.days ? 'var(--accent)' : 'var(--border)'}` }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a href={uiUrl ? `${uiUrl}/if/admin/#/events/list?action=login` : '#'}
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, textDecoration: 'none', color: 'inherit' }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          <span style={{ color: 'var(--green)' }}>✓</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{(data.logins ?? 0).toLocaleString()}</span>
          <span style={{ color: 'var(--text-dim)' }}>logins</span>
        </a>
        <a href={uiUrl ? `${uiUrl}/if/admin/#/events/list?action=login_failed` : '#'}
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)',
            border: `1px solid ${alerting ? 'var(--red)' : 'var(--border)'}`,
            fontSize: 11, textDecoration: 'none', color: 'inherit' }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = alerting ? 'var(--red)' : 'var(--border)'}>
          <span style={{ color: (data.failures ?? 0) > 0 ? 'var(--red)' : 'var(--text-dim)' }}>✗</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700,
            color: (data.failures ?? 0) > 0 ? 'var(--red)' : 'inherit' }}>{(data.failures ?? 0).toLocaleString()}</span>
          <span style={{ color: 'var(--text-dim)' }}>failed</span>
        </a>
        {data.activeSessions > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>⚡</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{data.activeSessions}</span>
            <span style={{ color: 'var(--text-dim)' }}>sessions</span>
          </div>
        )}
      </div>

      {/* Failed logins */}
      {hasFailures && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>
            Failed logins ({(data.recentFailures || []).length} shown)
          </div>
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
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{timeAgo(f.createdAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!hasFailures && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)' }}>
          ✓ No failed logins in this period
        </div>
      )}
    </div>
  )
}
