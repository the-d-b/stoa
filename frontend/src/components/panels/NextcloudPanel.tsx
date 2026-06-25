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
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}


function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4px 14px', borderRadius: 7, minWidth: 64,
      background: 'var(--surface2)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'DM Mono, monospace',
        color: color || 'var(--text)', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 5 }}>
      {children}
    </div>
  )
}

function ActivityBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', width: 26, textAlign: 'right', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: '#38bdf8', borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)',
        width: 22, textAlign: 'right', flexShrink: 0 }}>
        {value}
      </div>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '2px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function MemBar({ totalKb, freeKb }: { totalKb: number; freeKb: number }) {
  if (totalKb <= 0) return null
  const usedKb = totalKb - freeKb
  const pct = Math.round((usedKb / totalKb) * 100)
  const color = pct > 90 ? '#e53e3e' : pct > 75 ? '#f59e0b' : '#4ade80'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', width: 26, textAlign: 'right', flexShrink: 0 }}>
        RAM
      </div>
      <div style={{ flex: 1, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)',
        flexShrink: 0, textAlign: 'right', minWidth: 36 }}>
        {pct}%
      </div>
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
      padding: '10px 14px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading)       return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error)         return wrap(<div style={{ color: '#e53e3e', fontSize: 13 }}>{error}</div>)
  if (!data)         return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  const enabledUsers = data.numUsers - data.numDisabledUsers
  const hasUpdates   = data.numAppUpdates > 0
  const hasMemory    = data.memTotalKb > 0

  const updatesPill = hasUpdates && (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b',
      background: '#f59e0b18', border: '1px solid #f59e0b40',
      borderRadius: 5, padding: '3px 8px', flexShrink: 0 }}>
      {data.numAppUpdates} app update{data.numAppUpdates > 1 ? 's' : ''}
    </div>
  )

  // ── 1× ── single line ─────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const parts = [
      `${enabledUsers}/${data.numUsers} users`,
      `${fmtBytes(data.freeSpaceBytes)} free`,
      `${data.activeLast24h} active today`,
    ]
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8, overflow: 'hidden' }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>☁</span>
        <span style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {parts.join(' · ')}
        </span>
        {hasUpdates && (
          <span style={{ fontSize: 11, color: '#f59e0b', flexShrink: 0 }}>
            · {data.numAppUpdates} update{data.numAppUpdates > 1 ? 's' : ''}
          </span>
        )}
      </div>
    )
  }

  // ── chip row ── shared across 2×+ ─────────────────────────────────────────
  const chips = (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0, justifyContent: 'center' }}>
      <Chip label="Users" value={`${enabledUsers}/${data.numUsers}`} color="#4ade80" />
      <Chip label="Free"  value={fmtBytes(data.freeSpaceBytes)}      color="#38bdf8" />
      <Chip label="Files" value={fmtNum(data.numFiles)} />
    </div>
  )

  // ── activity bars ── shared across 2×+ ────────────────────────────────────
  const maxActive = data.numUsers || 1
  const activityBars = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <SectionLabel>Active users</SectionLabel>
      <ActivityBar label="5m"  value={data.activeLast5m}  max={maxActive} />
      <ActivityBar label="1h"  value={data.activeLast1h}  max={maxActive} />
      <ActivityBar label="24h" value={data.activeLast24h} max={maxActive} />
    </div>
  )

  // ── 2× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 2) {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        {chips}
        {hasUpdates && <div style={{ display: 'flex', justifyContent: 'center' }}>{updatesPill}</div>}
        {activityBars}
      </div>
    )
  }

  // ── 3× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'hidden' }}>
        {chips}
        {hasUpdates && <div style={{ display: 'flex', justifyContent: 'center' }}>{updatesPill}</div>}
        {activityBars}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SectionLabel>Shares</SectionLabel>
          <DataRow label="User shares"  value={String(data.numSharesUser)} />
          <DataRow label="Group shares" value={String(data.numSharesGroup)} />
          <DataRow label="Public links" value={String(data.numSharesLink)} />
        </div>
      </div>
    )
  }

  // ── 4×+ ──────────────────────────────────────────────────────────────────
  const serverLine = [
    data.version  && `NC ${data.version}`,
    data.dbType   && `${data.dbType}${data.dbVersion ? ` ${data.dbVersion}` : ''}`,
    data.webserver,
  ].filter(Boolean).join(' · ')

  return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'hidden' }}>
      {chips}
      {hasUpdates && <div style={{ display: 'flex', justifyContent: 'center' }}>{updatesPill}</div>}
      {activityBars}
      {hasMemory && <MemBar totalKb={data.memTotalKb} freeKb={data.memFreeKb} />}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SectionLabel>Shares</SectionLabel>
        <DataRow label="User shares"  value={String(data.numSharesUser)} />
        <DataRow label="Group shares" value={String(data.numSharesGroup)} />
        <DataRow label="Public links" value={String(data.numSharesLink)} />
        {serverLine && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)',
            fontFamily: 'DM Mono, monospace', paddingTop: 6,
            borderTop: '1px solid var(--border)' }}>
            {serverLine}
          </div>
        )}
      </div>
    </div>
  )
}
