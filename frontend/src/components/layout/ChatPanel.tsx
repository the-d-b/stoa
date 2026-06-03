import { useEffect, useRef, useState, useCallback } from 'react'
import { chatApi, aiApi, ChatMessage, PresenceUser } from '../../api'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { useTheme } from '../../context/ThemeContext'

const isMobile = () => window.innerWidth < 640
import { useChatSSE, useTypingSSE } from '../../hooks/useSSE'

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

function insertAtCursor(el: HTMLTextAreaElement | null, native: string, setValue: React.Dispatch<React.SetStateAction<string>>) {
  if (!el) { setValue(prev => prev + native); return }
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const newVal = el.value.slice(0, start) + native + el.value.slice(end)
  setValue(newVal)
  const pos = start + native.length
  setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos) }, 0)
}

function EmojiPickerButton({ onPick, emojiTheme }: { onPick: (native: string) => void; emojiTheme: 'dark' | 'light' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Emoji" style={{
        width: 32, height: 32, borderRadius: '50%', border: 'none',
        background: open ? 'var(--surface2)' : 'none', cursor: 'pointer',
        color: 'var(--text-dim)', fontSize: 17,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>☺</button>
      {open && (
        <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 600, marginBottom: 4 }}>
          <Picker data={data} theme={emojiTheme} onEmojiSelect={(e: any) => { onPick(e.native); setOpen(false) }} />
        </div>
      )}
    </div>
  )
}

// ── AI Tab (Claude or Gemini) ─────────────────────────────────────────────────

interface AIMsg { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }

interface AITabConfig {
  provider: 'claude' | 'gemini'
  label: string
  icon: string
  color: string
}

const AI_PROVIDERS: AITabConfig[] = [
  { provider: 'claude',  label: 'Claude',  icon: '✦', color: 'var(--accent)' },
  { provider: 'gemini',  label: 'Gemini',  icon: '✦', color: '#4285f4' },
]

function AITab({ config }: { config: AITabConfig }) {
  const [messages, setMessages] = useState<AIMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { provider, icon, color } = config
  const { themeDef } = useTheme()
  const emojiTheme = themeDef.dark ? 'dark' : 'light'

  useEffect(() => {
    setLoading(true)
    aiApi.history(provider)
      .then(r => { setMessages((r.data || []) as AIMsg[]); setError('') })
      .catch(() => setError('Could not load history'))
      .finally(() => setLoading(false))
  }, [provider])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setStreaming(true)
    setStreamingText('')
    setError('')

    // Optimistically add user message
    const tempUserMsg: AIMsg = {
      id: 'temp-' + Date.now(), role: 'user', content: text, createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const resp = await aiApi.chat(text, provider)
      if (!resp.ok) {
        const err = await resp.json()
        setError(err.error || 'Failed to send')
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
        return
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) { accumulated += parsed.text; setStreamingText(accumulated) }
            if (parsed.done) {
              // Append completed response directly — no reload needed
              const assistantMsg: AIMsg = {
                id: 'assistant-' + Date.now(),
                role: 'assistant',
                content: accumulated,
                createdAt: new Date().toISOString(),
              }
              setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, assistantMsg])
              setStreamingText('')
            }
          } catch {}
        }
      }
    } catch (e) {
      setError('Connection error')
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    } finally {
      setStreaming(false)
    }
  }

  const clear = async () => {
    if (!confirm('Clear your entire Claude conversation history?')) return
    await aiApi.clear(provider)
    setMessages([])
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
  )

  return (
    <>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && !streaming && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '20px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 28, color: color }}>{icon}</span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{config.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Ask me anything — homelab help,<br />general questions, or just chat.
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id} style={{
            display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-end', gap: 6,
          }}>
            {msg.role === 'assistant' && (
              <div style={{ width: 24, height: 24, borderRadius: '50%',
                background: color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, color: 'white', flexShrink: 0 }}>
                {icon}
              </div>
            )}
            <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 2 }}>
              <div title={timeAgo(msg.createdAt)} style={{
                padding: '7px 11px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                color: msg.role === 'user' ? 'white' : 'var(--text)',
                fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
              {(i === messages.length - 1 || messages[i+1]?.role !== msg.role) && (
                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4, marginRight: 4 }}>
                  {timeAgo(msg.createdAt)}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streaming && streamingText && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%',
              background: color, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, color: 'white', flexShrink: 0 }}>
              {icon}
            </div>
            <div style={{ maxWidth: '80%', padding: '7px 11px',
              borderRadius: '14px 14px 14px 4px',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
              color: 'var(--text)' }}>
              {streamingText}
              <span style={{ display: 'inline-block', width: 8, height: 14,
                background: 'var(--accent)', borderRadius: 2, marginLeft: 2,
                animation: 'cursor-blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {streaming && !streamingText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%',
              background: color, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, color: 'white', flexShrink: 0 }}>
              {icon}
            </div>
            <div style={{ padding: '7px 14px', borderRadius: '14px 14px 14px 4px',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-dim)' }}>
              <span style={{ letterSpacing: 3, animation: 'dots-fade 1.2s infinite' }}>···</span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: 'var(--red)', padding: '4px 8px',
            background: 'rgba(255,80,80,0.1)', borderRadius: 6 }}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)',
        flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <EmojiPickerButton emojiTheme={emojiTheme}
            onPick={native => insertAtCursor(inputRef.current, native, setInput)} />
          <textarea ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Message ${config.label}... (Enter to send)`}
            rows={1} style={{
              flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px',
              borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)',
              fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 80,
              overflowY: 'auto', outline: 'none',
            }} />
          <button onClick={send} disabled={streaming || !input.trim()} style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none',
            background: input.trim() && !streaming ? color : 'var(--surface2)',
            color: input.trim() && !streaming ? 'white' : 'var(--text-dim)',
            cursor: input.trim() && !streaming ? 'pointer' : 'default',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s',
          }}>↑</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={clear} style={{ fontSize: 10, color: 'var(--text-dim)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
            Clear history
          </button>
        </div>
      </div>
    </>
  )
}

// ── Linkify — turns http(s):// text into clickable links ─────────────────────
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>'"]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>
              {part}
            </a>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ── Main ChatPanel with tabs ──────────────────────────────────────────────────

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  currentUserId: string
  singleUser?: boolean
}

export default function ChatPanel({ open, onClose, currentUserId, singleUser }: ChatPanelProps) {
  const [tab, setTab] = useState<'stoa' | 'claude' | 'gemini'>('stoa')
  const [maximized, setMaximized] = useState(false)
  const [availableProviders, setAvailableProviders] = useState<{ claude: boolean; gemini: boolean }>({ claude: false, gemini: false })
  const { themeDef } = useTheme()
  const emojiTheme = themeDef.dark ? 'dark' : 'light'

  useEffect(() => {
    aiApi.providers().then(r => setAvailableProviders(r.data || { claude: false, gemini: false })).catch(() => {})
  }, [])
  const [typingUsers, setTypingUsers] = useState<{userId: string; username: string}[]>([])
  const [mobile, setMobile] = useState(isMobile())
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

  useEffect(() => {
    if (open && tab === 'stoa') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, tab])

  useEffect(() => {
    if (typingUsers.length > 0) typingBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [typingUsers])

  useEffect(() => {
    const onResize = () => setMobile(isMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const typingClearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const typingBottomRef = useRef<HTMLDivElement>(null)

  useTypingSSE((data: any) => {
    if (data.typing) {
      setTypingUsers(prev => prev.find(u => u.userId === data.userId)
        ? prev : [...prev, { userId: data.userId, username: data.username }])
      // Cancel previous auto-clear, set a fresh one
      if (typingClearTimers.current[data.userId]) clearTimeout(typingClearTimers.current[data.userId])
      typingClearTimers.current[data.userId] = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.userId !== data.userId))
        delete typingClearTimers.current[data.userId]
      }, 12000)
    } else {
      setTypingUsers(prev => prev.filter(u => u.userId !== data.userId))
      if (typingClearTimers.current[data.userId]) {
        clearTimeout(typingClearTimers.current[data.userId])
        delete typingClearTimers.current[data.userId]
      }
    }
  })

  useChatSSE((data) => {
    const msg = data as ChatMessage
    msg.own = msg.userId === currentUserId
    setMessages(prev => [...prev, msg])
    setTypingUsers(prev => prev.filter(u => u.userId !== msg.userId))
    chatApi.presence().then(r => setPresence(r.data || []))
  })

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isTypingRef = useRef(false)

  const stopTyping = () => {
    isTypingRef.current = false
    chatApi.typing(false).catch(() => {})
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
    if (typingHeartbeatRef.current) { clearInterval(typingHeartbeatRef.current); typingHeartbeatRef.current = null }
  }

  const handleInputChange = (val: string) => {
    setInput(val)
    if (!isTypingRef.current) {
      // Start typing session — send ping and start heartbeat
      isTypingRef.current = true
      chatApi.typing(true).catch(() => {})
      typingHeartbeatRef.current = setInterval(() => {
        chatApi.typing(true).catch(() => {})
      }, 6000) // re-ping every 6s so receiver's 12s timer keeps resetting
    }
    // Reset idle stop timer on every keystroke
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(stopTyping, 8000)
  }

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setInput('')
    stopTyping()
    try { await chatApi.send(text) } finally { setSending(false) }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const onlineCount = presence.filter(u => u.online).length

  if (!open) return null

  return (
    <>
      <style>{`
        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes dots-fade {
          0%, 100% { opacity: 0.3; } 50% { opacity: 1; }
        }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, zIndex: 490 }} onClick={onClose} />

      <div style={mobile || maximized ? {
        position: 'fixed', inset: maximized ? '5vh 5vw' : 0, zIndex: 500,
        background: 'var(--surface)', display: 'flex', flexDirection: 'column',
        borderRadius: maximized ? 14 : 0,
        border: maximized ? '1px solid var(--border2)' : 'none',
        boxShadow: maximized ? '0 24px 64px rgba(0,0,0,0.5)' : 'none',
        animation: 'chat-slide-up 0.2s ease',
      } : {
        position: 'fixed', bottom: 52, right: 64, zIndex: 500,
        width: 360, height: 480,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        animation: 'chat-slide-up 0.2s ease',
      }}>

        {/* Header */}
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setTab('stoa')} style={{
                padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: 'none', fontWeight: tab === 'stoa' ? 600 : 400,
                color: tab === 'stoa' ? 'var(--text)' : 'var(--text-dim)',
                borderBottom: tab === 'stoa' ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: 0,
              }}>💬 Stoa</button>
              {AI_PROVIDERS.filter(p => availableProviders[p.provider]).map(p => (
                <button key={p.provider} onClick={() => setTab(p.provider)} style={{
                  padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                  background: 'none', fontWeight: tab === p.provider ? 600 : 400,
                  color: tab === p.provider ? 'var(--text)' : 'var(--text-dim)',
                  borderBottom: tab === p.provider ? `2px solid ${p.color}` : '2px solid transparent',
                  borderRadius: 0,
                }}>{p.icon} {p.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {!mobile && (
                <button onClick={() => setMaximized(m => !m)} style={{ background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13,
                  lineHeight: 1, padding: '2px 6px' }} title={maximized ? 'Restore' : 'Maximize'}>
                  {maximized ? '⊡' : '⊞'}
                </button>
              )}
              <button onClick={onClose} style={{ background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18,
                lineHeight: 1, padding: '2px 4px' }}>×</button>
            </div>
          </div>

          {/* Presence — only on Stoa tab */}
          {tab === 'stoa' && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center', marginRight: 2 }}>
                {onlineCount > 0 ? `${onlineCount} online` : 'no one online'}
              </span>
              {presence.map(u => (
                <div key={u.userId} title={`${u.username}${u.online ? ' · online' : ''}`}>
                  <UserAvatar username={u.username} avatarUrl={u.avatarUrl} online={u.online} size={22} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stoa tab content */}
        {tab === 'stoa' && (
          <>
            {singleUser ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
                textAlign: 'center', gap: 12 }}>
                <span style={{ fontSize: 32 }}>💬</span>
                <div style={{ fontSize: 13, fontWeight: 600 }}>If a tree falls in the woods...</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  Stoa chat connects Stoa users — right now you're the only one here.
                  Add more users to start chatting.
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px',
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
                      {!msg.own && (
                        <div style={{ width: 24, flexShrink: 0, alignSelf: 'flex-end' }}>
                          {showName && <UserAvatar username={msg.username} avatarUrl={msg.avatarUrl} size={24} />}
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
                          <Linkify text={msg.text} />
                        </div>
                        {(i === messages.length - 1 || messages[i+1]?.userId !== msg.userId) && (
                          <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4,
                            marginRight: 4 }}>{timeAgo(msg.createdAt)}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {typingUsers.length > 0 && (
                  <div ref={typingBottomRef} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                    <div style={{ width: 24, flexShrink: 0 }} />
                    <div style={{ padding: '7px 12px', borderRadius: '14px 14px 14px 4px',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      fontSize: 12, color: 'var(--text-dim)' }}>
                      <span>{typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing</span>
                      <span style={{ letterSpacing: 2, marginLeft: 4 }}>···</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
            {!singleUser && (
              <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)',
                flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <EmojiPickerButton emojiTheme={emojiTheme}
                  onPick={native => insertAtCursor(inputRef.current, native, setInput)} />
                <textarea ref={inputRef} value={input} onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKey} placeholder="Message... (Enter to send)"
                  rows={1} style={{
                    flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px',
                    borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: 'var(--text)',
                    fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 80,
                    overflowY: 'auto', outline: 'none',
                  }} />
                <button onClick={send} disabled={sending || !input.trim()} style={{
                  width: 34, height: 34, borderRadius: '50%', border: 'none',
                  background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
                  color: input.trim() ? 'white' : 'var(--text-dim)',
                  cursor: input.trim() ? 'pointer' : 'default',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.15s',
                }}>↑</button>
              </div>
            )}
          </>
        )}

        {/* AI tabs */}
        {AI_PROVIDERS.filter(p => availableProviders[p.provider]).map(p => tab === p.provider && <AITab key={p.provider} config={p} />)}
      </div>
    </>
  )
}
