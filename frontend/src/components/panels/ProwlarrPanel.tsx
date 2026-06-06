import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface ProwlarrIndexer {
  id: number
  name: string
  enable: boolean
  protocol: string   // "torrent", "usenet"
  privacy: string    // "public", "semiPrivate", "private"
  health: string     // "ok", "degraded", "blocked", "disabled"
  disabledTill: string
  queries: number
  grabs: number
  failedQueries: number
  avgResponseMs: number
}

interface ProwlarrApp {
  id: number
  name: string
  implementation: string
  syncLevel: string
  enable: boolean
}

interface ProwlarrHealthIssue {
  source: string
  type: string   // "notice", "warning", "error"
  message: string
}

interface ProwlarrData {
  uiUrl: string
  integrationId: string
  version: string
  totalIndexers: number
  enabledIndexers: number
  failingIndexers: number
  torrentIndexers: number
  usenetIndexers: number
  totalQueries: number
  totalGrabs: number
  totalFailedQueries: number
  indexers: ProwlarrIndexer[]
  apps: ProwlarrApp[]
  healthIssues: ProwlarrHealthIssue[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthColor(health: string): string {
  switch (health) {
    case 'ok':       return '#4ade80'
    case 'degraded': return '#f59e0b'
    case 'blocked':  return '#e53e3e'
    default:         return 'var(--text-dim)'
  }
}

function privacyColor(privacy: string): string {
  switch (privacy?.toLowerCase()) {
    case 'private':     return '#22d3ee'
    case 'semiprivate': return '#a78bfa'
    default:            return '#6b7280'
  }
}

function privacyLabel(privacy: string): string {
  switch (privacy?.toLowerCase()) {
    case 'private':     return 'PVT'
    case 'semiprivate': return 'SEMI'
    default:            return 'PUB'
  }
}

function protocolColor(proto: string): string {
  return proto === 'usenet' ? '#a78bfa' : '#4ade80'
}

function issueColor(type: string): string {
  switch (type) {
    case 'error':   return '#e53e3e'
    case 'warning': return '#f59e0b'
    default:        return '#22d3ee'
  }
}

function syncLabel(level: string): string {
  switch (level?.toLowerCase()) {
    case 'fullsync': return 'Full Sync'
    case 'addonly':  return 'Add Only'
    default:         return level ?? 'Disabled'
  }
}

function fmtMs(ms: number): string {
  if (!ms) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, color, bg }: {
  label: string; value: string | number; color?: string; bg?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 10px', borderRadius: 8,
      background: bg || 'var(--surface2)', border: '1px solid var(--border)', minWidth: 60,
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

function IndexerDonut({ ok, total, size = 80 }: { ok: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? ok / total : 1
  const filled = circ * pct
  const color = pct === 1 ? '#4ade80' : pct >= 0.8 ? '#f59e0b' : '#e53e3e'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {ok}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
  )
}

function IndexerRow({ indexer, showStats }: { indexer: ProwlarrIndexer; showStats?: boolean }) {
  const color = healthColor(indexer.health)
  const privColor = privacyColor(indexer.privacy)
  const failRate = indexer.queries > 0 ? Math.round(indexer.failedQueries / indexer.queries * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: indexer.enable ? 'var(--text)' : 'var(--text-dim)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        fontStyle: indexer.enable ? 'normal' : 'italic' }}>
        {indexer.name}
      </span>
      {/* Protocol badge */}
      <span style={{
        fontSize: 9, fontWeight: 700, color: protocolColor(indexer.protocol),
        background: protocolColor(indexer.protocol) + '22',
        borderRadius: 3, padding: '1px 4px', flexShrink: 0, letterSpacing: '0.03em',
      }}>
        {indexer.protocol === 'usenet' ? 'NZB' : 'TRN'}
      </span>
      {/* Privacy badge */}
      <span style={{
        fontSize: 9, fontWeight: 700, color: privColor, background: privColor + '22',
        borderRadius: 3, padding: '1px 4px', flexShrink: 0,
      }}>
        {privacyLabel(indexer.privacy)}
      </span>
      {showStats && indexer.queries > 0 && (
        <>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)', flexShrink: 0 }}>
            {fmtCount(indexer.grabs)}↓
          </span>
          {indexer.avgResponseMs > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
              color: indexer.avgResponseMs > 3000 ? '#f59e0b' : 'var(--text-dim)', flexShrink: 0 }}>
              {fmtMs(indexer.avgResponseMs)}
            </span>
          )}
          {failRate > 0 && (
            <span style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0 }}>
              {failRate}%✗
            </span>
          )}
        </>
      )}
    </div>
  )
}

function HealthIssueRow({ issue }: { issue: ProwlarrHealthIssue }) {
  const color = issueColor(issue.type)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {issue.message}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{issue.source}</div>
      </div>
    </div>
  )
}

function AppRow({ app }: { app: ProwlarrApp }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: app.enable ? '#4ade80' : 'var(--text-dim)' }} />
      <span style={{ fontSize: 12, color: app.enable ? 'var(--text)' : 'var(--text-dim)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {app.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
        {syncLabel(app.syncLevel)}
      </span>
    </div>
  )
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
      borderBottom: '1px solid var(--border)', paddingBottom: 3 }}>
      {children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ProwlarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ProwlarrData | null>(null)
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

  if (!integrationId) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No integration configured.</div>
  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
  if (error) return <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>
  if (!data) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No data</div>

  const {
    totalIndexers, enabledIndexers, failingIndexers, torrentIndexers, usenetIndexers,
    totalQueries, totalGrabs, totalFailedQueries,
    indexers = [], apps = [], healthIssues = [], version,
  } = data

  const okIndexers = enabledIndexers - failingIndexers
  const hasIssues = failingIndexers > 0 || healthIssues.length > 0
  const overallColor = hasIssues ? (failingIndexers > enabledIndexers / 2 ? '#e53e3e' : '#f59e0b') : '#4ade80'

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: overallColor }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {enabledIndexers}/{totalIndexers} indexers
          </span>
        </div>
        {failingIndexers > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
            {failingIndexers} failing
          </span>
        </>}
        {healthIssues.length > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#f59e0b' }}>
            {healthIssues.length} issue{healthIssues.length !== 1 ? 's' : ''}
          </span>
        </>}
        {totalGrabs > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {fmtCount(totalGrabs)} grabs
          </span>
        </>}
        {version && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            v{version}
          </span>
        </>}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Donut + chips */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <IndexerDonut ok={okIndexers} total={enabledIndexers} size={80} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            <StatChip label="Enabled" value={`${enabledIndexers}/${totalIndexers}`} color="#4ade80" />
            {failingIndexers > 0 && <StatChip label="Failing" value={failingIndexers} color="#e53e3e" bg="#e53e3e18" />}
            {torrentIndexers > 0 && <StatChip label="Torrent" value={torrentIndexers} color="#4ade80" />}
            {usenetIndexers > 0 && <StatChip label="Usenet" value={usenetIndexers} color="#a78bfa" />}
            {totalGrabs > 0 && <StatChip label="Grabs" value={fmtCount(totalGrabs)} />}
            {version && <StatChip label="Version" value={`v${version}`} />}
          </div>
        </div>

        {/* Health issues */}
        {healthIssues.length > 0 && (
          <div>
            <ColHeader>Issues ({healthIssues.length})</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {healthIssues.map((h, i) => <HealthIssueRow key={i} issue={h} />)}
            </div>
          </div>
        )}

        {/* Indexer list */}
        <div>
          <ColHeader>Indexers</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {indexers.slice(0, 8).map((idx, i) => <IndexerRow key={i} indexer={idx} />)}
            {indexers.length > 8 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 13 }}>
                +{indexers.length - 8} more
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Donut + chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <IndexerDonut ok={okIndexers} total={enabledIndexers} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <StatChip label="Enabled" value={`${enabledIndexers}/${totalIndexers}`} color="#4ade80" />
          {failingIndexers > 0 && <StatChip label="Failing" value={failingIndexers} color="#e53e3e" bg="#e53e3e18" />}
          {torrentIndexers > 0 && <StatChip label="Torrent" value={torrentIndexers} color="#4ade80" />}
          {usenetIndexers > 0 && <StatChip label="Usenet" value={usenetIndexers} color="#a78bfa" />}
          {totalGrabs > 0 && <StatChip label="Total Grabs" value={fmtCount(totalGrabs)} />}
          {totalQueries > 0 && <StatChip label="Queries" value={fmtCount(totalQueries)} />}
          {totalFailedQueries > 0 && <StatChip label="Failed" value={fmtCount(totalFailedQueries)} color="#f59e0b" />}
          {apps.length > 0 && <StatChip label="Apps" value={apps.length} />}
          {version && <StatChip label="Version" value={`v${version}`} />}
        </div>
      </div>

      {/* Three-column: indexers | issues + apps | indexer stats detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 1fr', gap: 12 }}>

        {/* Col 1: Full indexer list with basic info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Indexers ({totalIndexers})</ColHeader>
          {indexers.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No indexers configured</div>
            : indexers.map((idx, i) => <IndexerRow key={i} indexer={idx} />)
          }
        </div>

        {/* Col 2: Issues + connected apps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div>
            <ColHeader>Issues {healthIssues.length > 0 ? `(${healthIssues.length})` : '(none)'}</ColHeader>
            {healthIssues.length === 0
              ? <div style={{ fontSize: 12, color: '#4ade80' }}>All clear</div>
              : healthIssues.map((h, i) => <HealthIssueRow key={i} issue={h} />)
            }
          </div>
          {apps.length > 0 && (
            <div>
              <ColHeader>Apps ({apps.length})</ColHeader>
              {apps.map((a, i) => <AppRow key={i} app={a} />)}
            </div>
          )}
        </div>

        {/* Col 3: Indexer stats (grabs, response time, fail rate) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Stats (lifetime)</ColHeader>
          {indexers.filter(idx => idx.queries > 0).length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No query history</div>
            : indexers.filter(idx => idx.queries > 0).map((idx, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, minWidth: 0 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                  {idx.name}
                </span>
                <span style={{ color: '#4ade80', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                  {fmtCount(idx.grabs)}↓
                </span>
                {idx.avgResponseMs > 0 && (
                  <span style={{
                    color: idx.avgResponseMs > 3000 ? '#f59e0b' : 'var(--text-dim)',
                    fontFamily: 'DM Mono, monospace', flexShrink: 0,
                  }}>
                    {fmtMs(idx.avgResponseMs)}
                  </span>
                )}
                {idx.failedQueries > 0 && idx.queries > 0 && (
                  <span style={{ color: '#f59e0b', flexShrink: 0 }}>
                    {Math.round(idx.failedQueries / idx.queries * 100)}%✗
                  </span>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
