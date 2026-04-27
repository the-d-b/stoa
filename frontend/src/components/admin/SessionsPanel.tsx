import { useEffect, useState } from 'react'
import { sessionsApi, SessionRow } from '../../api'

function timeAgo(iso: string) {
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

type TimeFilter = '1' | '7' | '30' | 'all'

export default function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TimeFilter>('7')


  const load = async (f: TimeFilter = filter) => {
    setLoading(true)
    try {
      const res = await sessionsApi.list(f === 'all' ? undefined : f)
      setSessions(res.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

  const onlineCount = new Set(sessions.filter(s => s.online).map(s => s.userId)).size
  const filterBtns: { label: string; val: TimeFilter }[] = [
    { label: '1d', val: '1' }, { label: '7d', val: '7' },
    { label: '30d', val: '30' }, { label: 'All', val: 'all' },
  ]

  return (
    <div>
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

      {loading ? (
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
    </div>
  )
}
