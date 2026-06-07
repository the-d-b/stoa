import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface NextcloudData {
  uiUrl: string
  integrationId: string
  version: string
  freeSpaceBytes: number
  numFiles: number
  numUsers: number
  numDisabledUsers: number
  numStorages: number
  activeLast5m: number
  activeLast1h: number
  activeLast24h: number
  numShares: number
  numSharesLink: number
  numSharesUser: number
  numSharesGroup: number
  numAppsInstalled: number
  numAppUpdates: number
  phpVersion: string
  dbType: string
  dbVersion: string
  memTotalKb: number
  memFreeKb: number
  webserver: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtKB(kb: number): string {
  return fmtBytes(kb * 1024)
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function memPercent(total: number, free: number): number {
  if (total <= 0) return 0
  return Math.round((1 - free / total) * 100)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      marginBottom: 5, borderBottom: '1px solid var(--border)', paddingBottom: 3,
    }}>
      {children}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 12px', borderRadius: 8,
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 64,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: color || 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function UsageDonut({ used, total, size = 80, label }: { used: number; total: number; size?: number; label?: string }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? Math.min(used / total, 1) : 0
  const filled = circ * pct
  const color = pct > 0.9 ? '#e53e3e' : pct > 0.75 ? '#f59e0b' : '#4ade80'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.22, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {Math.round(pct * 100)}%
      </text>
      {label && (
        <text x={cx} y={cy + size * 0.2} textAnchor="middle"
          fill="var(--text-dim)" style={{ fontSize: size * 0.11 }}>
          {label}
        </text>
      )}
    </svg>
  )
}

function ActivityBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: '#38bdf8', borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)', width: 24, textAlign: 'right', flexShrink: 0 }}>
        {value}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, width: 80 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'DM Mono, monospace',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function NextcloudPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<NextcloudData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string = config.integrationId || ''

  useEffect(() => {
    if (!integrationId) { setLoading(false); return }
    integrationsApi.getPanelData(panel.id)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(e => { setError(e.response?.data?.error || e.message || 'Failed to load'); setLoading(false) })
  }, [panel.id, integrationId])

  const wrap = (children: React.ReactNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error) return wrap(<div style={{ color: '#e53e3e', fontSize: 13 }}>{error}</div>)
  if (!data) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  const memUsed = data.memTotalKb - data.memFreeKb
  const memPct = memPercent(data.memTotalKb, data.memFreeKb)

  // ── 1× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatChip label="Users" value={data.numUsers} color="#4ade80" />
        <StatChip label="Active" value={data.activeLast24h} color="#38bdf8" />
        <StatChip label="Files" value={fmtNum(data.numFiles)} />
        <StatChip label="Storage" value={fmtBytes(data.freeSpaceBytes) + ' free'} />
        {data.numAppUpdates > 0 && <StatChip label="Updates" value={data.numAppUpdates} color="#f59e0b" />}
        {data.version && <StatChip label="Version" value={data.version} />}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatChip label="Users" value={`${data.numUsers - data.numDisabledUsers}/${data.numUsers}`} color="#4ade80" />
          <StatChip label="Files" value={fmtNum(data.numFiles)} />
          <StatChip label="Free" value={fmtBytes(data.freeSpaceBytes)} color="#38bdf8" />
          <StatChip label="Shares" value={data.numShares} />
          {data.numAppUpdates > 0 && <StatChip label="Updates" value={data.numAppUpdates} color="#f59e0b" />}
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ColHeader>Active Users</ColHeader>
            <ActivityBar label="5m" value={data.activeLast5m} max={data.numUsers} />
            <ActivityBar label="1h" value={data.activeLast1h} max={data.numUsers} />
            <ActivityBar label="24h" value={data.activeLast24h} max={data.numUsers} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ColHeader>Shares</ColHeader>
            <InfoRow label="User shares" value={String(data.numSharesUser)} />
            <InfoRow label="Group shares" value={String(data.numSharesGroup)} />
            <InfoRow label="Links" value={String(data.numSharesLink)} />
            <InfoRow label="Total" value={String(data.numShares)} />
          </div>
        </div>
      </>
    )
  }

  // ── 4×+ — three columns ───────────────────────────────────────────────────
  return wrap(
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatChip label="Users" value={`${data.numUsers - data.numDisabledUsers}/${data.numUsers}`} color="#4ade80" />
        <StatChip label="Files" value={fmtNum(data.numFiles)} />
        <StatChip label="Free" value={fmtBytes(data.freeSpaceBytes)} color="#38bdf8" />
        <StatChip label="Shares" value={data.numShares} />
        {data.numAppUpdates > 0 && <StatChip label="Updates" value={data.numAppUpdates} color="#f59e0b" />}
        {data.version && <StatChip label="NC" value={data.version} />}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — Server info */}
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Server</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.webserver && <InfoRow label="Web" value={data.webserver} />}
            {data.phpVersion && <InfoRow label="PHP" value={data.phpVersion} />}
            {data.dbType && <InfoRow label="DB" value={`${data.dbType} ${data.dbVersion}`} />}
            {data.memTotalKb > 0 && <InfoRow label="Memory" value={`${fmtKB(memUsed)} / ${fmtKB(data.memTotalKb)} (${memPct}%)`} />}
            {data.numAppsInstalled > 0 && <InfoRow label="Apps" value={`${data.numAppsInstalled} installed`} />}
            {data.numAppUpdates > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', background: '#f59e0b22',
                  borderRadius: 3, padding: '2px 6px' }}>
                  {data.numAppUpdates} update{data.numAppUpdates > 1 ? 's' : ''} available
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Col 2 — Users & activity */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Users & Activity</ColHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <UsageDonut used={memUsed} total={data.memTotalKb} size={70} label="RAM" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActivityBar label="5m" value={data.activeLast5m} max={data.numUsers || 1} />
              <ActivityBar label="1h" value={data.activeLast1h} max={data.numUsers || 1} />
              <ActivityBar label="24h" value={data.activeLast24h} max={data.numUsers || 1} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <InfoRow label="Active users" value={`${data.numUsers - data.numDisabledUsers} enabled, ${data.numDisabledUsers} disabled`} />
          </div>
        </div>

        {/* Col 3 — Shares */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Shares</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InfoRow label="Total" value={String(data.numShares)} />
            <InfoRow label="User → User" value={String(data.numSharesUser)} />
            <InfoRow label="User → Group" value={String(data.numSharesGroup)} />
            <InfoRow label="Public links" value={String(data.numSharesLink)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <ColHeader>Files & Storage</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <InfoRow label="Files" value={fmtNum(data.numFiles)} />
              <InfoRow label="Free space" value={fmtBytes(data.freeSpaceBytes)} />
              <InfoRow label="Storages" value={String(data.numStorages)} />
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
