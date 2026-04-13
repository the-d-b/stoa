import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import ArcGauge from './ArcGauge'

interface TrueNASGauge { used: number; label: string }
interface TrueNASPool {
  name: string; status: string
  usedGb: number; totalGb: number; percent: number
}
interface TrueNASAlert { level: string; message: string }
interface TrueNASDisk { name: string; tempC: number; serial: string }
interface TrueNASData {
  uiUrl: string; hostname: string; version: string
  cpu: TrueNASGauge; memory: TrueNASGauge
  pools: TrueNASPool[]; alerts: TrueNASAlert[]; disks: TrueNASDisk[]
}

const ALERT_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', WARNING: 'var(--amber)', INFO: 'var(--text-muted)'
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE: 'var(--green)', DEGRADED: 'var(--amber)', FAULTED: 'var(--red)'
}

function fmtSize(gb: number) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(0)} GB`
}

function MiniBar({ pct, color }: { pct: number; color?: string }) {
  const c = color || (pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--accent)')
  return (
    <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: c, borderRadius: 2 }} />
    </div>
  )
}

export default function TrueNASPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TrueNASData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 60

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
  const alerts = (data.alerts || []).filter(a => a.level !== 'INFO')

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Gauges row ────────────────────────────────────────────────────────────
  const Gauges = ({ size }: { size?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
      <ArcGauge value={data.cpu?.used ?? 0} label={data.cpu?.label ?? ''} size={size} title="CPU" />
      <ArcGauge value={data.memory?.used ?? 0} label={data.memory?.label ?? ''} size={size} title="RAM" />
    </div>
  )

  // ── Pool rows ─────────────────────────────────────────────────────────────
  const Pools = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {(data.pools || []).map(p => (
        <div key={p.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLOR[p.status] || 'var(--text-dim)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {fmtSize(p.usedGb)} / {fmtSize(p.totalGb)}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
              color: p.percent >= 90 ? 'var(--red)' : p.percent >= 75 ? 'var(--amber)' : 'var(--text-muted)',
              width: 32, textAlign: 'right' }}>
              {p.percent.toFixed(0)}%
            </span>
          </div>
          <div style={{ paddingLeft: 14 }}>
            <MiniBar pct={p.percent} />
          </div>
        </div>
      ))}
    </div>
  )

  // ── Alert banners ─────────────────────────────────────────────────────────
  const Alerts = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11,
          background: a.level === 'CRITICAL' ? '#f8717112' : '#fbbf2410',
          border: `1px solid ${a.level === 'CRITICAL' ? '#f8717130' : '#fbbf2430'}`,
          color: ALERT_COLOR[a.level] || 'var(--text-muted)',
        }}>
          <span style={{ flexShrink: 0, fontWeight: 600 }}>{a.level}</span>
          <span style={{ flex: 1 }}>{a.message}</span>
        </div>
      ))}
    </div>
  )

  // ── Disk temps ────────────────────────────────────────────────────────────
  const Disks = () => {
    const disks = (data.disks || []).filter(d => d.tempC > 0)
    if (disks.length === 0) return null
    const rows: TrueNASDisk[][] = []
    for (let i = 0; i < disks.length; i += 4) rows.push(disks.slice(i, i + 4))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map((d, di) => {
              const hot = d.tempC >= 55
              const warm = d.tempC >= 45
              return (
                <div key={di} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', borderRadius: 5,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  fontSize: 10, fontFamily: 'DM Mono, monospace',
                }}>
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{d.name}</span>
                  <span style={{ fontWeight: 600, color: hot ? 'var(--red)' : warm ? 'var(--amber)' : 'var(--text)' }}>
                    {d.tempC.toFixed(0)}°
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── Header link ───────────────────────────────────────────────────────────
  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
        onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
        {data.hostname || 'TrueNAS'}
      </a>
      {alerts.length > 0 && (
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10,
          background: alerts.some(a => a.level === 'CRITICAL') ? '#f8717118' : '#fbbf2418',
          border: `1px solid ${alerts.some(a => a.level === 'CRITICAL') ? '#f8717130' : '#fbbf2430'}`,
          color: alerts.some(a => a.level === 'CRITICAL') ? 'var(--red)' : 'var(--amber)',
          fontWeight: 600 }}>
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )

  // ── 1x — gauges only ─────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Gauges size={68} />
    </div>
  )

  // ── 2x — gauges + pools ───────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Gauges />
      {sectionTitle('Pools')}
      <Pools />
    </div>
  )

  // ── 4x — header + gauges + pools + alerts + disk temps ────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      <Gauges />
      {sectionTitle('Pools')}
      <Pools />
      {alerts.length > 0 && (
        <>
          {sectionTitle('Alerts')}
          <Alerts />
        </>
      )}
      {(data.disks || []).some(d => d.tempC > 0) && (
        <>
          {sectionTitle('Disk temperatures')}
          <Disks />
        </>
      )}
    </div>
  )
}
