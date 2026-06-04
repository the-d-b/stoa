import { useEffect, useRef, useState } from 'react'
import { chatApi, presenceApi, PresenceUser, PresenceStatus } from '../../api'

const STATUS_OPTIONS: { key: PresenceStatus; label: string; color: string }[] = [
  { key: 'available', label: 'Available',       color: 'var(--green)' },
  { key: 'away',      label: 'Away',            color: 'var(--amber)' },
  { key: 'busy',      label: 'Busy',            color: '#f97316' },
  { key: 'dnd',       label: 'Do Not Disturb',  color: 'var(--red)' },
]

const EXPIRY_OPTIONS = [
  { label: 'Never',     minutes: null as number | null },
  { label: '30 min',    minutes: 30 },
  { label: '1 hour',    minutes: 60 },
  { label: '2 hours',   minutes: 120 },
  { label: '4 hours',   minutes: 240 },
  { label: 'End of day', minutes: -1 }, // sentinel
]

function statusColor(s: PresenceStatus) {
  return STATUS_OPTIONS.find(o => o.key === s)?.color ?? 'var(--text-dim)'
}

function expiryFromMinutes(minutes: number | null): string | undefined {
  if (minutes === null) return undefined
  if (minutes === -1) {
    const d = new Date()
    d.setHours(23, 59, 59, 0)
    return d.toISOString()
  }
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function StatusDot({ status, size = 10 }: { status: PresenceStatus; size?: number }) {
  const color = statusColor(status)
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      ...(status === 'dnd' ? { boxShadow: `0 0 0 1.5px var(--surface), 0 0 0 2.5px ${color}` } : {}),
    }} />
  )
}

interface Props {
  currentUserId: string
  onStartDM?: (userId: string, username: string, avatarUrl: string) => void
}

export default function PresenceWidget({ currentUserId, onStartDM }: Props) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [myStatus, setMyStatus] = useState<PresenceStatus>('available')
  const [selectedExpiry, setSelectedExpiry] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPresence = async () => {
    const r = await chatApi.presence()
    const list: PresenceUser[] = r.data || []
    setUsers(list)
    const me = list.find(u => u.userId === currentUserId)
    if (me) setMyStatus(me.status)
  }

  useEffect(() => {
    if (!open) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    fetchPresence()
    pollRef.current = setInterval(fetchPresence, 30_000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const applyStatus = async (status: PresenceStatus) => {
    setMyStatus(status)
    setSaving(true)
    const expiresAt = expiryFromMinutes(selectedExpiry)
    await presenceApi.setStatus(status, expiresAt)
    setSaving(false)
    setUsers(prev => prev.map(u =>
      u.userId === currentUserId ? { ...u, status } : u
    ))
  }

  const applyExpiry = async (minutes: number | null) => {
    setSelectedExpiry(minutes)
    if (myStatus === 'available') return // expiry only meaningful with non-available status
    setSaving(true)
    const expiresAt = expiryFromMinutes(minutes)
    await presenceApi.setStatus(myStatus, expiresAt)
    setSaving(false)
  }

  const others = users.filter(u => u.userId !== currentUserId)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Button — shows your own status dot */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Presence"
        style={{
          width: 30, height: 30, borderRadius: 8,
          border: `1px solid ${open ? 'var(--border)' : 'var(--border)'}`,
          background: open ? 'var(--surface2)' : 'var(--surface)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, gap: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: statusColor(myStatus),
          position: 'absolute', bottom: 3, right: 3,
          border: '1.5px solid var(--surface)',
        }} />
      </button>

      {/* Popup */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 600,
          width: 240, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>
          {/* Your status */}
          <div style={{ padding: '12px 14px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Your Status {saving && <span style={{ fontWeight: 400, textTransform: 'none' }}>· saving…</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.key} type="button" onClick={() => applyStatus(opt.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: myStatus === opt.key ? 'var(--surface2)' : 'transparent',
                  textAlign: 'left', width: '100%',
                  outline: myStatus === opt.key ? `1.5px solid ${opt.color}40` : 'none',
                }}>
                  <StatusDot status={opt.key} size={9} />
                  <span style={{ fontSize: 13, color: myStatus === opt.key ? 'var(--text)' : 'var(--text-muted)' }}>
                    {opt.label}
                  </span>
                  {myStatus === opt.key && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: opt.color }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry — only when not available */}
          {myStatus !== 'available' && (
            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                Reset after
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {EXPIRY_OPTIONS.map(opt => (
                  <button key={opt.label} type="button" onClick={() => applyExpiry(opt.minutes)} style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11,
                    background: selectedExpiry === opt.minutes ? 'var(--accent-bg)' : 'var(--surface2)',
                    color: selectedExpiry === opt.minutes ? 'var(--accent)' : 'var(--text-muted)',
                  }}>{opt.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Others */}
          {others.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px 4px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                  Others
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {others.map(u => (
                    <div key={u.userId} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 6px', borderRadius: 6,
                    }}>
                      {/* Avatar */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'var(--surface2)',
                          border: `1.5px solid ${u.online ? statusColor(u.status) : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden',
                        }}>
                          {u.avatarUrl
                            ? <img src={u.avatarUrl} alt={u.username}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : u.username.slice(0, 2).toUpperCase()
                          }
                        </div>
                        <span style={{
                          position: 'absolute', bottom: -1, right: -1,
                          width: 7, height: 7, borderRadius: '50%',
                          background: u.online ? statusColor(u.status) : 'var(--border)',
                          border: '1.5px solid var(--surface)',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.username}
                      </span>
                      <span style={{ fontSize: 10, color: u.online ? statusColor(u.status) : 'var(--text-dim)' }}>
                        {u.online
                          ? STATUS_OPTIONS.find(o => o.key === u.status)?.label ?? u.status
                          : 'Offline'}
                      </span>
                      {onStartDM && (
                        <button type="button"
                          title={`Message ${u.username}`}
                          onClick={() => { onStartDM(u.userId, u.username, u.avatarUrl || ''); setOpen(false) }}
                          style={{
                            width: 22, height: 22, borderRadius: 6, border: 'none',
                            background: 'var(--surface2)', cursor: 'pointer', fontSize: 11,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, color: 'var(--text-dim)',
                          }}>💬</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: 8 }} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
