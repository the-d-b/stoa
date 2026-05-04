import { useEffect, useRef, useState, useCallback } from 'react'
import { chatApi, ChatMessage, PresenceUser } from '../../api'
import { useChatSSE } from '../../hooks/useSSE'

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' })
}

function UserAvatar({ username, avatarUrl, online, size = 26 }: {
  username: string; avatarUrl?: string; online?: boolean; size?: number
}) {
  const initials = username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        background: 'var(--surface2)',
        border: `2px solid ${online ? 'var(--green)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: size * 0.38, fontWeight: 600, color: 'var(--text-muted)' }}>{initials}</span>
        }
      </div>
      {online !== undefined && (
        <span style={{ position: 'absolute', bottom: 0, right: 0,
          width: 8, height: 8, borderRadius: '50%',
          background: online ? 'var(--green)' : 'var(--border)',
          border: '2px solid var(--surface)' }} />
      )}
    </div>
  )
}

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  currentUserId: string
  singleUser?: boolean
}

export default function ChatPanel({ open, onClose, currentUserId, singleUser }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const [mr, pr] = await Promise.all([chatApi.messages(), chatApi.presence()])
    const msgs = mr.data || []
    setMessages(msgs)
    setHasOlder(msgs.length >= 100)
    setPresence(pr.data || [])
  }, [])

  const loadOlder = async () => {
    if (messages.length === 0) return
    setLoadingOlder(true)
    try {
      const oldest = messages[0].id
      const r = await chatApi.messages(oldest)
      const older = r.data || []
      setMessages(prev => [...older, ...prev])
      setHasOlder(older.length >= 100)
    } finally { setLoadingOlder(false) }
  }

  useEffect(() => {
    if (open) {
      load()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Real-time chat via SSE
  useChatSSE((data) => {
    const msg = data as ChatMessage
    msg.own = msg.userId === currentUserId
    setMessages(prev => [...prev, msg])
    chatApi.presence().then(r => setPresence(r.data || []))
  })

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setInput('')
    try {
      await chatApi.send(text)
      // Message will arrive via SSE broadcast to all clients including sender
    } finally { setSending(false) }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const onlineCount = presence.filter(u => u.online).length

  if (!open) return null

  return (
    <>
      {/* Backdrop — click to close */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 490 }}
        onClick={onClose} />

      {/* Slide-up panel */}
      <div style={{
        position: 'fixed', bottom: 52, right: 64, zIndex: 500,
        width: 360, height: 480,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        animation: 'chat-slide-up 0.2s ease',
      }}>
        <style>{`
          @keyframes chat-slide-up {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)',
          flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Stoa Chat
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8, fontWeight: 400 }}>
                {onlineCount > 0 ? `${onlineCount} online` : 'no one online'}
              </span>
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18, lineHeight: 1,
              padding: '2px 4px' }}>×</button>
          </div>
          {/* Presence avatars */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {presence.map(u => (
              <div key={u.userId} title={`${u.username}${u.online ? ' · online' : ''}`}>
                <UserAvatar username={u.username} avatarUrl={u.avatarUrl} online={u.online} size={26} />
              </div>
            ))}
          </div>
        </div>

        {/* Single-user mode notice */}
        {singleUser && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
            textAlign: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>💬</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              If a tree falls in the woods...
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Stoa chat connects Stoa users — it doesn't bridge to Slack, Teams,
              or anywhere outside. Right now you're the only one here, so there's
              nobody to hear it. Add more users and switch to multi-user mode to
              start chatting.
            </div>
            <code style={{ fontFamily: 'DM Mono, monospace', fontSize: 11,
              background: 'var(--surface2)', padding: '3px 8px', borderRadius: 4,
              color: 'var(--text-muted)' }}>
              stoa-cli config set-mode multi --user &lt;username&gt;
            </code>
          </div>
        )}

        {/* Messages */}
        {!singleUser && <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasOlder && (
            <div style={{ textAlign: 'center', paddingBottom: 4 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? 'Loading...' : '↑ Load older messages'}
              </button>
            </div>
          )}
          {messages.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center',
              marginTop: 40 }}>No messages yet. Say hello!</div>
          )}
          {messages.map((msg, i) => {
            const showName = i === 0 || messages[i-1].userId !== msg.userId
            return (
              <div key={msg.id} style={{
                display: 'flex', flexDirection: msg.own ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 6,
              }}>
                {/* Avatar — only show for others, only when sender changes */}
                {!msg.own && (
                  <div style={{ width: 24, flexShrink: 0, alignSelf: 'flex-end' }}>
                    {showName && (
                      <UserAvatar username={msg.username} avatarUrl={msg.avatarUrl} size={24} />
                    )}
                  </div>
                )}
                <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column',
                  alignItems: msg.own ? 'flex-end' : 'flex-start', gap: 2 }}>
                  {showName && !msg.own && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
                      {msg.username}
                    </span>
                  )}
                  <div title={timeAgo(msg.createdAt)} style={{
                    padding: '7px 11px', borderRadius: msg.own
                      ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.own ? 'var(--accent)' : 'var(--surface2)',
                    color: msg.own ? 'white' : 'var(--text)',
                    fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word',
                    border: msg.own ? 'none' : '1px solid var(--border)',
                  }}>
                    {msg.text}
                  </div>
                  {(i === messages.length - 1 || messages[i+1]?.userId !== msg.userId) && (
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4,
                      marginRight: 4 }}>{timeAgo(msg.createdAt)}</span>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>}

        {/* Input */}
        {!singleUser && <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)',
          flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey} placeholder="Message... (Enter to send)"
            rows={1} style={{
              flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px',
              borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)',
              fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 80, overflowY: 'auto',
              outline: 'none',
            }} />
          <button onClick={send} disabled={sending || !input.trim()} style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none',
            background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
            color: input.trim() ? 'white' : 'var(--text-dim)',
            cursor: input.trim() ? 'pointer' : 'default',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s',
          }}>↑</button>
        </div>}
      </div>
    </>
  )
}
