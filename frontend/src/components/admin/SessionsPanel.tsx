import { useEffect, useRef, useState } from 'react'
import { sessionsApi, sessionConfigApi, SessionRow, integrationHealthApi, IntegrationHealthItem, auditApi, AuditEntry } from '../../api'

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  if (diff < 86400*7) return `${Math.floor(diff/86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
}

function Avatar({ username, avatarUrl, online }: { username: string; avatarUrl?: string; online: boolean }) {
  const initials = username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
        background: 'var(--surface2)', border: '2px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{initials}</span>
        }
      </div>
      {online && (
        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9,
          borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--surface)' }} />
      )}
    </div>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  auth: 'AUTH',
  rate_limit: 'RATE LIMIT',
  connection: 'CONNECTION',
  tls: 'TLS',
  unknown: 'UNKNOWN',
}

function categoryColor(cat: string): { bg: string; color: string; border: string } {
  switch (cat) {
    case 'auth':       return { bg: 'var(--accent-bg)', color: 'var(--accent2)', border: 'var(--accent)' }
    case 'rate_limit': return { bg: 'rgba(255,165,0,0.12)', color: '#e6a817', border: 'rgba(255,165,0,0.35)' }
    case 'connection': return { bg: 'rgba(255,80,80,0.12)', color: 'var(--red)', border: 'rgba(255,80,80,0.35)' }
    case 'tls':        return { bg: 'rgba(180,100,255,0.12)', color: '#b464ff', border: 'rgba(180,100,255,0.35)' }
    default:           return { bg: 'var(--surface2)', color: 'var(--text-dim)', border: 'var(--border)' }
  }
}

function IntegrationHealthSection() {
  const [items, setItems] = useState<IntegrationHealthItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    try {
      const res = await integrationHealthApi.list()
      setItems(res.data || [])
    } catch {
      // silently ignore — admin may not have integrations
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 30_000)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  const displayed = errorsOnly ? items.filter(i => i.status !== 'healthy') : items

  const statusDot = (status: string) => {
    const color = status === 'healthy' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--text-dim)'
    return <span style={{ color, fontSize: 14, lineHeight: 1 }}>●</span>
  }

  return (
    <div style={{ marginBottom: 24, padding: '16px 20px', background: 'var(--surface2)',
      borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Integration Workers</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setErrorsOnly(v => !v)}
            style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: errorsOnly ? 'var(--accent-bg)' : 'var(--surface)',
              color: errorsOnly ? 'var(--accent2)' : 'var(--text-muted)',
              border: `1px solid ${errorsOnly ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: errorsOnly ? 600 : 400,
            }}
          >
            Errors only
          </button>
          <button
            onClick={load}
            style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No enabled integrations.</div>
      ) : displayed.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No errors — all integrations healthy.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {displayed.map(item => {
            const catStyle = item.status === 'error' && item.errorCategory
              ? categoryColor(item.errorCategory) : null
            return (
              <div key={item.integrationId} style={{
                display: 'grid',
                gridTemplateColumns: '16px minmax(120px,1fr) 80px 90px 80px 1fr',
                alignItems: 'center',
                gap: 10,
                padding: '5px 4px',
                borderRadius: 6,
                fontSize: 12,
              }}>
                {/* Status dot */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {statusDot(item.status)}
                </div>

                {/* Name */}
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.integrationName || item.integrationId}
                </div>

                {/* Type */}
                <div style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {item.integrationType}
                </div>

                {/* Status / error count */}
                <div>
                  {item.status === 'healthy' && (
                    <span style={{ color: 'var(--green)', fontWeight: 500 }}>
                      Healthy
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span style={{ color: 'var(--red)', fontWeight: 500 }}>
                      {item.consecutiveErrors} error{item.consecutiveErrors !== 1 ? 's' : ''}
                    </span>
                  )}
                  {item.status === 'pending' && (
                    <span style={{ color: 'var(--text-dim)' }}>Pending</span>
                  )}
                </div>

                {/* Last success / last error time */}
                <div style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {item.status === 'healthy' && item.lastSuccessAt
                    ? timeAgo(item.lastSuccessAt)
                    : item.status === 'error' && item.lastErrorAt
                    ? timeAgo(item.lastErrorAt)
                    : item.status === 'pending'
                    ? 'never fetched'
                    : '—'}
                </div>

                {/* Error category + message */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {item.status === 'error' && item.errorCategory && catStyle && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                      background: catStyle.bg, color: catStyle.color, border: `1px solid ${catStyle.border}`,
                      fontWeight: 700, letterSpacing: '0.04em',
                    }}>
                      {CATEGORY_LABELS[item.errorCategory] || item.errorCategory.toUpperCase()}
                    </span>
                  )}
                  {item.status === 'error' && item.lastError && (
                    <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.lastError.length > 60 ? item.lastError.slice(0, 60) + '…' : item.lastError}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

type AuditCategory = 'all' | 'auth.' | 'user.' | 'group.' | 'secret.' | 'integration.'

const AUDIT_CATEGORIES: { label: string; prefix: AuditCategory }[] = [
  { label: 'All', prefix: 'all' },
  { label: 'Auth', prefix: 'auth.' },
  { label: 'Users', prefix: 'user.' },
  { label: 'Groups', prefix: 'group.' },
  { label: 'Secrets', prefix: 'secret.' },
  { label: 'Integrations', prefix: 'integration.' },
]

function actionBadgeStyle(action: string): { bg: string; color: string; border: string } {
  if (action.startsWith('auth.'))        return { bg: 'var(--accent-bg)', color: 'var(--accent2)', border: 'var(--accent)' }
  if (action.startsWith('user.'))        return { bg: 'rgba(255,165,0,0.12)', color: '#e6a817', border: 'rgba(255,165,0,0.35)' }
  if (action.startsWith('group.'))       return { bg: 'rgba(50,205,50,0.12)', color: '#3cba5e', border: 'rgba(50,205,50,0.35)' }
  if (action.startsWith('secret.'))      return { bg: 'rgba(255,80,80,0.12)', color: 'var(--red)', border: 'rgba(255,80,80,0.35)' }
  if (action.startsWith('integration.')) return { bg: 'rgba(0,200,200,0.12)', color: '#2ab8b8', border: 'rgba(0,200,200,0.35)' }
  return { bg: 'var(--surface2)', color: 'var(--text-dim)', border: 'var(--border)' }
}

function parseMeta(raw: string | null): string {
  if (!raw) return ''
  try {
    const obj = JSON.parse(raw) as Record<string, string>
    return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('  ')
  } catch {
    return raw
  }
}

function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<AuditCategory>('all')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async (cat: AuditCategory = category) => {
    try {
      const prefix = cat === 'all' ? undefined : cat
      const res = await auditApi.list(prefix)
      setEntries(res.data || [])
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load(category)
    intervalRef.current = setInterval(() => load(category), 60_000)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [category])

  return (
    <div>
      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {AUDIT_CATEGORIES.map(c => (
          <button
            key={c.prefix}
            onClick={() => setCategory(c.prefix)}
            style={{
              padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: category === c.prefix ? 'var(--accent-bg)' : 'var(--surface2)',
              color: category === c.prefix ? 'var(--accent2)' : 'var(--text-muted)',
              border: `1px solid ${category === c.prefix ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: category === c.prefix ? 600 : 400,
            }}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => load(category)}
          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
            background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)',
            marginLeft: 'auto' }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>
      ) : entries.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No audit events recorded yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Time', 'Actor', 'Action', 'Target', 'Details'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '6px 10px 8px',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const badge = actionBadgeStyle(e.action)
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)',
                      fontFamily: 'DM Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}
                      title={e.createdAt}>
                      {timeAgo(e.createdAt)}
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {e.actorName || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 5,
                        background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                        fontWeight: 600, fontFamily: 'DM Mono, monospace', letterSpacing: '0.02em',
                      }}>
                        {e.action}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {e.targetName || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-dim)',
                      fontFamily: 'DM Mono, monospace', fontSize: 11, maxWidth: 320,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {parseMeta(e.metadata)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type TimeFilter = '1' | '7' | '30' | 'all'

type MainTab = 'sessions' | 'audit'

export default function SessionsPanel() {
  const [activeTab, setActiveTab] = useState<MainTab>('sessions')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsError, setSessionsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TimeFilter>('7')
  const [sessionHours, setSessionHours] = useState('24')
  const [savingSession, setSavingSession] = useState(false)
  const [savedSession, setSavedSession] = useState(false)

  useEffect(() => {
    sessionConfigApi.get().then((r: any) => setSessionHours(r.data.sessionDurationHours || '24')).catch(() => {})
  }, [])

  const saveSession = async () => {
    setSavingSession(true); setSavedSession(false)
    try {
      await sessionConfigApi.save(sessionHours)
      setSavedSession(true); setTimeout(() => setSavedSession(false), 3000)
    } finally { setSavingSession(false) }
  }

  const load = async (f: TimeFilter = filter) => {
    setLoading(true)
    try {
      const res = await sessionsApi.list(f === 'all' ? undefined : f)
      setSessions(res.data || [])
      setSessionsError('')
    } catch (e: any) {
      setSessionsError(e.response?.data?.error || 'Failed to load sessions')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

  const onlineCount = new Set(sessions.filter(s => s.online).map(s => s.userId)).size
  const filterBtns: { label: string; val: TimeFilter }[] = [
    { label: '1d', val: '1' }, { label: '7d', val: '7' },
    { label: '30d', val: '30' }, { label: 'All', val: 'all' },
  ]

  const TAB_LABELS: { id: MainTab; label: string }[] = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'audit', label: 'Audit Log' },
  ]

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TAB_LABELS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 18px', borderRadius: '7px 7px 0 0', fontSize: 13, cursor: 'pointer',
              background: activeTab === t.id ? 'var(--surface)' : 'transparent',
              color: activeTab === t.id ? 'var(--text)' : 'var(--text-muted)',
              border: activeTab === t.id ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: activeTab === t.id ? '1px solid var(--surface)' : '1px solid transparent',
              fontWeight: activeTab === t.id ? 600 : 400,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'audit' && <AuditLogSection />}

      {activeTab === 'sessions' && <>
      {/* Integration health */}
      <IntegrationHealthSection />

      {/* Session duration */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: 'var(--surface2)',
        borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Session duration</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.6 }}>
          How long a login session stays valid before the user must sign in again.
          SSO sessions may be shorter depending on your identity provider.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="input" value={sessionHours} onChange={e => setSessionHours(e.target.value)}
            style={{ cursor: 'pointer', maxWidth: 240 }}>
            <option value="0.167">10 minutes (QA testing only)</option>
            <option value="1">1 hour</option>
            <option value="4">4 hours</option>
            <option value="8">8 hours</option>
            <option value="24">24 hours (default)</option>
            <option value="48">48 hours</option>
            <option value="168">7 days</option>
          </select>
          <button className="btn btn-primary" onClick={saveSession} disabled={savingSession}>
            {savingSession ? <span className="spinner" /> : savedSession ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Sessions</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {onlineCount > 0
              ? <><span style={{ color: 'var(--green)', fontWeight: 600 }}>●</span> {onlineCount} user{onlineCount !== 1 ? 's' : ''} online now</>
              : 'No users currently online'}
          </div>
        </div>
        {/* Time filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {filterBtns.map(b => (
            <button key={b.val} onClick={() => setFilter(b.val)} style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: filter === b.val ? 'var(--accent-bg)' : 'var(--surface2)',
              color: filter === b.val ? 'var(--accent2)' : 'var(--text-muted)',
              border: `1px solid ${filter === b.val ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: filter === b.val ? 600 : 400,
            }}>{b.label}</button>
          ))}
        </div>
      </div>

      {sessionsError ? (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 0' }}>⚠ {sessionsError}</div>
      ) : loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>
      ) : sessions.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No sessions in this period.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['User', 'Role', 'IP Address', 'Client', 'Logged in', 'Last seen', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px 8px',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} style={{
                  borderBottom: '1px solid var(--border)',
                  opacity: s.enabled ? 1 : 0.5,
                }}>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar username={s.username} avatarUrl={s.avatarUrl} online={s.online} />
                      <span style={{ fontWeight: 500 }}>{s.username}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 6,
                      background: s.role === 'admin' ? 'var(--accent-bg)' : 'var(--surface2)',
                      color: s.role === 'admin' ? 'var(--accent2)' : 'var(--text-dim)',
                      border: `1px solid ${s.role === 'admin' ? 'var(--accent)' : 'var(--border)'}`,
                    }}>{s.role}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace',
                    fontSize: 12, color: 'var(--text-muted)' }}>{s.ip || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: 180,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.userAgent || '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)',
                    fontFamily: 'DM Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {timeAgo(s.issuedAt)}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)',
                    fontFamily: 'DM Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {s.online
                      ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Online now</span>
                      : timeAgo(s.lastSeenAt)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {s.enabled
                      ? <span style={{ fontSize: 11, color: 'var(--green)' }}>Active</span>
                      : <span style={{ fontSize: 11, color: 'var(--red)' }}>Disabled</span>}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </div>
  )
}
