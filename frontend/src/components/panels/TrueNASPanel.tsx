import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface TrueNASPool {
  name: string; status: string
  usedGb: number; totalGb: number; percent: number
}
interface TrueNASAlert { level: string; message: string }
interface TrueNASDisk { name: string; tempC: number }
interface TrueNASVM { name: string; status: string }
interface TrueNASApp { name: string; status: string; updateAvailable: boolean }
interface TrueNASData {
  uiUrl: string; hostname: string; version: string
  totalRam: string; cpuModel: string; cpuCores: number
  cpuPercent: number; ramUsedGb: number; ramTotalGb: number; ramPercent: number
  pools: TrueNASPool[]; alerts: TrueNASAlert[]
  disks: TrueNASDisk[]; vms: TrueNASVM[]; apps: TrueNASApp[]
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE: 'var(--green)', DEGRADED: 'var(--amber)', FAULTED: 'var(--red)'
}
const ALERT_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', WARNING: 'var(--amber)', INFO: 'var(--text-muted)'
}

function fmtSize(gb: number) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(0)} GB`
}

function MiniBar({ pct }: { pct: number }) {
  const c = pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--accent)'
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
  const integrationId = config.integrationId as string | undefined

  // SSE — primary data source, ~2s updates from TrueNAS WebSocket push
  const sseData = useSSE<TrueNASData>(integrationId)

  // Apply SSE data immediately when it arrives
  useEffect(() => {
    if (sseData) {
      setData(sseData)
      setLoading(false)
      setError('')
    }
  }, [sseData])

  // HTTP fallback — initial load + slow safety-net poll if SSE drops
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
    const interval = setInterval(load, 300 * 1000) // 5 min fallback
    return () => clearInterval(interval)
  }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const pools = data.pools || []
  const alerts = (data.alerts || []).filter(a => a.level !== 'INFO')
  const disks = (data.disks || []).filter(d => d.tempC > 0)
  const vms = data.vms || []
  const apps = data.apps || []

  // VM counts
  const vmRunning = vms.filter(v => ['RUNNING','running'].includes(v.status)).length
  const vmStopped = vms.length - vmRunning

  // App counts
  const appRunning = apps.filter(a => ['RUNNING','running','active','ACTIVE'].includes(a.status)).length
  const appStopped = apps.filter(a => !['RUNNING','running','active','ACTIVE'].includes(a.status)).length
  const appUpdates = apps.filter(a => a.updateAvailable).length

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── System info strip — shown on all sizes ────────────────────────────────
  const SysInfo = () => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6, justifyContent: 'center' }}>
        <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
            padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)',
            border: '1px solid var(--border)' }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          {data.hostname || 'TrueNAS'}
        </a>
        {data.totalRam && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {data.totalRam}
          </span>
        )}
        {data.cpuCores > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {data.cpuCores} cores
          </span>
        )}
        {alerts.length > 0 && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
            background: alerts.some(a => a.level === 'CRITICAL') ? '#f8717118' : '#fbbf2418',
            border: `1px solid ${alerts.some(a => a.level === 'CRITICAL') ? '#f8717130' : '#fbbf2430'}`,
            color: alerts.some(a => a.level === 'CRITICAL') ? 'var(--red)' : 'var(--amber)' }}>
            ⚠ {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {data.cpuPercent > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, flexShrink: 0 }}>CPU</span>
          <MiniBar pct={data.cpuPercent} />
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
            color: data.cpuPercent >= 90 ? 'var(--red)' : data.cpuPercent >= 75 ? 'var(--amber)' : 'var(--text-muted)' }}>
            {data.cpuPercent.toFixed(0)}%
          </span>
        </div>
      )}
      {data.ramTotalGb > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, flexShrink: 0 }}>RAM</span>
          <MiniBar pct={data.ramPercent} />
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
            color: data.ramPercent >= 90 ? 'var(--red)' : data.ramPercent >= 75 ? 'var(--amber)' : 'var(--text-muted)' }}>
            {data.ramPercent.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  )

  // ── Pool detail rows ──────────────────────────────────────────────────────
  const PoolRows = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {pools.map(p => (
        <div key={p.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLOR[p.status] || 'var(--text-dim)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {fmtSize(p.usedGb)} / {fmtSize(p.totalGb)}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
              color: p.percent >= 90 ? 'var(--red)' : p.percent >= 75 ? 'var(--amber)' : 'var(--text-muted)' }}>
              {p.percent.toFixed(0)}%
            </span>
          </div>
          <div style={{ paddingLeft: 14 }}><MiniBar pct={p.percent} /></div>
        </div>
      ))}
    </div>
  )

  // ── Alerts ────────────────────────────────────────────────────────────────
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
    const rows: TrueNASDisk[][] = []
    for (let i = 0; i < disks.length; i += 4) rows.push(disks.slice(i, i + 4))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map((d, di) => (
              <div key={di} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', borderRadius: 5,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 10, fontFamily: 'DM Mono, monospace' }}>
                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{d.name}</span>
                <span style={{ fontWeight: 600,
                  color: d.tempC >= 55 ? 'var(--red)' : d.tempC >= 45 ? 'var(--amber)' : 'var(--text)' }}>
                  {d.tempC.toFixed(0)}°
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── Summary pills for VMs / Apps ─────────────────────────────────────────
  const Pill = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
        color: color || 'var(--text)' }}>{value}</span>
    </div>
  )

  const VMSummary = () => vms.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
      <Pill label="running" value={vmRunning} color="var(--green)" />
      {vmStopped > 0 && <Pill label="stopped" value={vmStopped} color="var(--text-dim)" />}
    </div>
  )

  const AppSummary = () => apps.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
      <Pill label="running" value={appRunning} color="var(--green)" />
      {appStopped > 0 && <Pill label="stopped" value={appStopped} color="var(--text-dim)" />}
      {appUpdates > 0 && <Pill label="updates" value={appUpdates} color="var(--amber)" />}
    </div>
  )

  // ── 1x — sys info + pools ─────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <SysInfo />
      <PoolRows />
    </div>
  )

  // ── 2x — sys info + pools ────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <SysInfo />
      {sectionTitle('Pools')}
      <PoolRows />
    </div>
  )

  // ── 4x — everything ──────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <SysInfo />
      {sectionTitle('Pools')}
      <PoolRows />
      {alerts.length > 0 && (
        <>
          {sectionTitle('Alerts')}
          <Alerts />
        </>
      )}
      {disks.length > 0 && (
        <>
          {sectionTitle('Disk temperatures')}
          <Disks />
        </>
      )}
      {vms.length > 0 && (
        <>
          {sectionTitle('Virtual machines')}
          <VMSummary />
        </>
      )}
      {apps.length > 0 && (
        <>
          {sectionTitle('Apps')}
          <AppSummary />
        </>
      )}
    </div>
  )
}
