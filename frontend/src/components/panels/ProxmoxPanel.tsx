import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import ArcGauge from './ArcGauge'

interface ProxmoxGauge { used: number; label: string }
interface ProxmoxStorage {
  name: string; usedGb: number; totalGb: number; percent: number; active: boolean
}
interface ProxmoxVM {
  id: number; name: string; type: string
  status: string; cpu: number; memPct: number; uptime: number
}
interface ProxmoxTemp { name: string; tempC: number }
interface ProxmoxData {
  uiUrl: string; node: string
  cpu: ProxmoxGauge; memory: ProxmoxGauge
  storage: ProxmoxStorage[]; vms: ProxmoxVM[]; temps: ProxmoxTemp[]
  netIn: number; netOut: number
  loadAvg: number; ioWait: number
  cpuPressure: number; memPressure: number; ioPressure: number
}

function fmtSize(gb: number) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(0)} GB`
}

function fmtNet(bytesPerSec: number) {
  if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

function fmtUptime(secs: number) {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  return `${h}h`
}

function MiniBar({ pct, color }: { pct: number; color?: string }) {
  const c = color || (pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--accent)')
  return (
    <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: c, borderRadius: 2 }} />
    </div>
  )
}

export default function ProxmoxPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ProxmoxData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 30

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
  const running = (data.vms || []).filter(v => v.status === 'running').length
  const total = (data.vms || []).length

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  const Gauges = ({ size }: { size?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
      <ArcGauge value={data.cpu?.used ?? 0} label={data.cpu?.label ?? ''} size={size} title="CPU" />
      <ArcGauge value={data.memory?.used ?? 0} label={data.memory?.label ?? ''} size={size} title="RAM" />
    </div>
  )

  const StorageSection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {(data.storage || []).map(s => (
        <div key={s.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: s.active ? 'var(--green)' : 'var(--text-dim)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{s.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {fmtSize(s.usedGb)} / {fmtSize(s.totalGb)}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
              color: s.percent >= 90 ? 'var(--red)' : s.percent >= 75 ? 'var(--amber)' : 'var(--text-muted)',
              width: 32, textAlign: 'right' }}>
              {s.percent.toFixed(0)}%
            </span>
          </div>
          <div style={{ paddingLeft: 14 }}><MiniBar pct={s.percent} /></div>
        </div>
      ))}
    </div>
  )

  const VMList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(data.vms || []).map(vm => {
        const isRunning = vm.status === 'running'
        return (
          <div key={vm.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 8px', borderRadius: 6,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            opacity: isRunning ? 1 : 0.5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: isRunning ? 'var(--green)' : 'var(--text-dim)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
              flexShrink: 0, width: 14 }}>{vm.type === 'lxc' ? 'CT' : 'VM'}</span>
            <span style={{ fontSize: 12, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{vm.name}</span>
            {isRunning && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 50, flexShrink: 0 }}>
                  <MiniBar pct={vm.cpu} />
                  <MiniBar pct={vm.memPct} color="var(--green)" />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                  fontFamily: 'DM Mono, monospace', width: 30, textAlign: 'right' }}>
                  {fmtUptime(vm.uptime)}
                </span>
              </>
            )}
            {!isRunning && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>stopped</span>
            )}
          </div>
        )
      })}
    </div>
  )

  // ── 1x — gauges only ─────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Gauges size={68} />
    </div>
  )

  // ── 2x — gauges + VM list ─────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Gauges />
      {sectionTitle(`VMs & Containers — ${running}/${total} running`)}
      <VMList />
    </div>
  )

  // ── 4x — node header + gauges + storage + VMs ────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
          onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
          {data.node || 'Proxmox'}
        </a>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{running}/{total} running</span>
        {(data.netIn > 0 || data.netOut > 0) && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 10,
            fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
            <span>↓ <span style={{ color: 'var(--green)' }}>{fmtNet(data.netIn)}</span></span>
            <span>↑ <span style={{ color: 'var(--amber)' }}>{fmtNet(data.netOut)}</span></span>
          </span>
        )}
      </div>
      <Gauges />
      {(data.loadAvg > 0 || data.ioWait > 0 || data.cpuPressure > 0) && (
        <>
          {sectionTitle('System')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {data.loadAvg > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11 }}>
                <span style={{ color: 'var(--text-dim)' }}>load</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
                  color: data.loadAvg > 2 ? 'var(--amber)' : 'var(--text)' }}>
                  {data.loadAvg.toFixed(2)}
                </span>
              </div>
            )}
            {data.ioWait > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11 }}>
                <span style={{ color: 'var(--text-dim)' }}>iowait</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
                  color: data.ioWait > 20 ? 'var(--amber)' : 'var(--text)' }}>
                  {data.ioWait.toFixed(1)}%
                </span>
              </div>
            )}
            {data.cpuPressure > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11 }}>
                <span style={{ color: 'var(--text-dim)' }}>cpu psi</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
                  color: data.cpuPressure > 30 ? 'var(--amber)' : 'var(--text)' }}>
                  {data.cpuPressure.toFixed(1)}%
                </span>
              </div>
            )}
            {data.memPressure > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11 }}>
                <span style={{ color: 'var(--text-dim)' }}>mem psi</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
                  color: data.memPressure > 20 ? 'var(--amber)' : 'var(--text)' }}>
                  {data.memPressure.toFixed(1)}%
                </span>
              </div>
            )}
            {data.ioPressure > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11 }}>
                <span style={{ color: 'var(--text-dim)' }}>io psi</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
                  color: data.ioPressure > 20 ? 'var(--amber)' : 'var(--text)' }}>
                  {data.ioPressure.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </>
      )}
      {sectionTitle('VMs & Containers')}
      <VMList />
      {sectionTitle('Storage')}
      <StorageSection />
      {(data.temps || []).length > 0 && (
        <>
          {sectionTitle('Temperatures')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {data.temps.map((t, i) => {
              const hot = t.tempC >= 80
              const warm = t.tempC >= 65
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '2px 8px', borderRadius: 6,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  fontSize: 10, fontFamily: 'DM Mono, monospace',
                }}>
                  <span style={{ color: 'var(--text-dim)' }}>{t.name}</span>
                  <span style={{ fontWeight: 600, color: hot ? 'var(--red)' : warm ? 'var(--amber)' : 'var(--text)' }}>
                    {t.tempC.toFixed(0)}°
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
