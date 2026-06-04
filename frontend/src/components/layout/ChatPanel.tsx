import { useEffect, useRef, useState, useCallback } from 'react'
import { chatApi, aiApi, dmApi, ChatMessage, ChatAttachment, DMConversation, DMMessage, PresenceUser } from '../../api'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { useTheme } from '../../context/ThemeContext'

const isMobile = () => window.innerWidth < 640
import { useChatSSE, useTypingSSE, useDMSSE } from '../../hooks/useSSE'

// ── Status dot colors ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  available: 'var(--green)',
  away:      'var(--amber)',
  busy:      '#f97316',
  dnd:       'var(--red)',
}

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? 'var(--text-dim)'
}

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

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function authedFetch(url: string) {
  const token = localStorage.getItem('stoa_token')
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}

function AuthenticatedImage({ src, alt }: { src: string; alt: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    authedFetch(src)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.blob() })
      .then(blob => {
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setObjectUrl(u)
      })
      .catch(() => setError(true))
    return () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null } }
  }, [src])

  if (error) return <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: 4 }}>Image unavailable</span>
  if (!objectUrl) return <div style={{ width: 80, height: 50, background: 'var(--surface2)', borderRadius: 6, opacity: 0.5 }} />
  return <img src={objectUrl} alt={alt}
    style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, display: 'block', objectFit: 'contain' }} />
}

function AttachmentBubble({ attachment, onDelete }: { attachment: ChatAttachment; onDelete?: () => void }) {
  const isImage = attachment.mimeType.startsWith('image/')
  const [hovered, setHovered] = useState(false)

  const download = async () => {
    try {
      const r = await authedFetch(attachment.url)
      const blob = await r.blob()
      const u = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = u; a.download = attachment.originalName; a.click()
      URL.revokeObjectURL(u)
    } catch {}
  }

  const DeleteBtn = onDelete ? (
    <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
      style={{
        position: 'absolute', top: 4, right: 4,
        width: 18, height: 18, borderRadius: '50%', border: 'none',
        background: 'rgba(0,0,0,0.55)', color: 'white',
        cursor: 'pointer', fontSize: 12, lineHeight: 1,
        display: hovered ? 'flex' : 'none',
        alignItems: 'center', justifyContent: 'center',
      }}>×</button>
  ) : null

  if (isImage) {
    return (
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <AuthenticatedImage src={attachment.url} alt={attachment.originalName} />
        {DeleteBtn}
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button type="button" onClick={download} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
        color: 'var(--text)', cursor: 'pointer', fontSize: 12, width: '100%', textAlign: 'left',
      }}>
        <span style={{ fontSize: 18 }}>📎</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachment.originalName}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{formatBytes(attachment.size)}</div>
        </div>
      </button>
      {DeleteBtn}
    </div>
  )
}

function AttachButton({ onAttachment, onClear, pending }: {
  onAttachment: (a: ChatAttachment) => void
  onClear: () => void
  pending: ChatAttachment | null
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const r = await chatApi.uploadAttachment(file)
      onAttachment(r.data)
      setOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed')
    } finally { setUploading(false) }
    e.target.value = ''
  }

  const handleURL = async () => {
    if (!urlInput.trim()) return
    setUploading(true); setError('')
    try {
      const r = await chatApi.fetchAttachment(urlInput.trim())
      onAttachment(r.data)
      setUrlInput('')
      setOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fetch failed')
    } finally { setUploading(false) }
  }

  if (pending) {
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
          borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid var(--border)',
          fontSize: 11, color: 'var(--accent)',
        }}>
          <span>{pending.mimeType.startsWith('image/') ? '🖼' : '📎'}</span>
          <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pending.originalName}
          </span>
          <button type="button" onClick={onClear} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 14, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => setOpen(o => !o)} title="Attach file or image" style={{
        width: 32, height: 32, borderRadius: '50%', border: 'none',
        background: open ? 'var(--surface2)' : 'none', cursor: 'pointer',
        color: 'var(--text-dim)', fontSize: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>📎</button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, zIndex: 600, marginBottom: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 12, width: 240, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(['file', 'url'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '4px 0', fontSize: 11, borderRadius: 6, border: 'none',
                cursor: 'pointer', fontWeight: mode === m ? 600 : 400,
                background: mode === m ? 'var(--accent-bg)' : 'var(--surface2)',
                color: mode === m ? 'var(--accent)' : 'var(--text-dim)',
              }}>{m === 'file' ? '📂 File' : '🔗 URL'}</button>
            ))}
          </div>
          {mode === 'file' ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
              width: '100%', padding: '8px 0', borderRadius: 8, border: '1px dashed var(--border)',
              background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
            }}>{uploading ? 'Uploading...' : 'Click to choose file'}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input className="input" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                onKeyDown={e => { if (e.key === 'Enter') handleURL() }}
                style={{ fontSize: 12 }} />
              <button type="button" onClick={handleURL} disabled={uploading || !urlInput.trim()} style={{
                padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'white', fontSize: 12,
                opacity: uploading || !urlInput.trim() ? 0.5 : 1,
              }}>{uploading ? 'Fetching...' : 'Fetch & cache'}</button>
            </div>
          )}
          {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
        </div>
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
    } catch {
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

      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
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

// ── DM Conversation View ──────────────────────────────────────────────────────

function DMView({
  conversation, onMarkRead, emojiTheme,
}: {
  conversation: DMConversation
  onMarkRead: (conversationId: string) => void
  emojiTheme: 'dark' | 'light'
}) {
  const [messages, setMessages] = useState<DMMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null)
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const r = await dmApi.messages(conversation.id)
    const msgs = r.data || []
    setMessages(msgs)
    setHasOlder(msgs.length >= 100)
    // Mark as read
    dmApi.markRead(conversation.id).catch(() => {})
    onMarkRead(conversation.id)
  }, [conversation.id])

  useEffect(() => {
    load()
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [conversation.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadOlder = async () => {
    if (messages.length === 0) return
    setLoadingOlder(true)
    try {
      const oldest = messages[0].id
      const r = await dmApi.messages(conversation.id, oldest)
      const older = r.data || []
      setMessages(prev => [...older, ...prev])
      setHasOlder(older.length >= 100)
    } finally { setLoadingOlder(false) }
  }

  // Called from parent when DM SSE event arrives for this conversation
  const appendMessage = useCallback((msg: DMMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    // Auto-mark as read since we're viewing this conversation
    dmApi.markRead(conversation.id).catch(() => {})
    onMarkRead(conversation.id)
  }, [conversation.id])

  // Expose appendMessage via a ref so the parent can call it
  const appendRef = useRef(appendMessage)
  appendRef.current = appendMessage
  ;(conversation as any)._appendDMMessage = (msg: DMMessage) => appendRef.current(msg)

  const send = async () => {
    const text = input.trim()
    if (!text && !pendingAttachment) return
    setSending(true)
    setInput('')
    const att = pendingAttachment
    setPendingAttachment(null)
    try {
      await dmApi.send(conversation.id, text, att?.id)
    } finally { setSending(false) }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
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
          const showName = i === 0 || messages[i-1].senderId !== msg.senderId
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: msg.own ? 'row-reverse' : 'row',
              alignItems: 'flex-end', gap: 6,
            }}>
              {!msg.own && (
                <div style={{ width: 24, flexShrink: 0, alignSelf: 'flex-end' }}>
                  {showName && <UserAvatar username={msg.senderUsername} avatarUrl={msg.senderAvatarUrl} size={24} />}
                </div>
              )}
              <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column',
                alignItems: msg.own ? 'flex-end' : 'flex-start', gap: 2 }}>
                {showName && !msg.own && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
                    {msg.senderUsername}
                  </span>
                )}
                <div title={timeAgo(msg.createdAt)} style={{
                  padding: msg.attachment && !msg.text ? '4px' : '7px 11px',
                  borderRadius: msg.own ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.own ? 'var(--accent)' : 'var(--surface2)',
                  color: msg.own ? 'white' : 'var(--text)',
                  fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word',
                  border: msg.own ? 'none' : '1px solid var(--border)',
                  overflow: 'hidden',
                }}>
                  {msg.attachment && (
                    <AttachmentBubble attachment={msg.attachment}
                      onDelete={msg.own ? async () => {
                        await chatApi.deleteAttachment(msg.attachment!.id)
                        setMessages(prev => prev.map(m =>
                          m.id === msg.id ? { ...m, attachment: undefined } : m
                        ))
                      } : undefined} />
                  )}
                  {msg.text && <Linkify text={msg.text} />}
                </div>
                {(i === messages.length - 1 || messages[i+1]?.senderId !== msg.senderId) && (
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4,
                    marginRight: 4 }}>{timeAgo(msg.createdAt)}</span>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <AttachButton pending={pendingAttachment}
            onAttachment={a => setPendingAttachment(a)}
            onClear={() => setPendingAttachment(null)} />
          <EmojiPickerButton emojiTheme={emojiTheme}
            onPick={native => insertAtCursor(inputRef.current, native, setInput)} />
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey} placeholder={`Message ${conversation.otherUsername}...`}
            rows={1} style={{
              flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px',
              borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)',
              fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 80,
              overflowY: 'auto', outline: 'none',
            }} />
          <button onClick={send} disabled={sending || (!input.trim() && !pendingAttachment)} style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none',
            background: (input.trim() || pendingAttachment) ? 'var(--accent)' : 'var(--surface2)',
            color: (input.trim() || pendingAttachment) ? 'white' : 'var(--text-dim)',
            cursor: (input.trim() || pendingAttachment) ? 'pointer' : 'default',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s',
          }}>↑</button>
        </div>
      </div>
    </>
  )
}

// ── Linkify ───────────────────────────────────────────────────────────────────
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

// ── Active view type ──────────────────────────────────────────────────────────
type ActiveView =
  | { kind: 'stoa' }
  | { kind: 'ai'; provider: 'claude' | 'gemini' }
  | { kind: 'dm'; conversationId: string }

// ── Main ChatPanel ────────────────────────────────────────────────────────────

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  currentUserId: string
  singleUser?: boolean
  pendingDM?: { conversationId: string; otherUserId: string; otherUsername: string; otherAvatarUrl: string } | null
  onDMOpened?: () => void
  onDMRead?: () => void
}

export default function ChatPanel({
  open, onClose, currentUserId, singleUser,
  pendingDM, onDMOpened, onDMRead,
}: ChatPanelProps) {
  const [activeView, setActiveView] = useState<ActiveView>({ kind: 'stoa' })
  const [maximized, setMaximized] = useState(false)
  const [availableProviders, setAvailableProviders] = useState<{ claude: boolean; gemini: boolean }>({ claude: false, gemini: false })
  const { themeDef } = useTheme()
  const emojiTheme = themeDef.dark ? 'dark' : 'light'

  // Group chat state
  const [typingUsers, setTypingUsers] = useState<{userId: string; username: string}[]>([])
  const [mobile, setMobile] = useState(isMobile())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [input, setInput] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null)
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingBottomRef = useRef<HTMLDivElement>(null)

  // DM state
  const [dmConversations, setDmConversations] = useState<DMConversation[]>([])

  const activeViewRef = useRef(activeView)
  activeViewRef.current = activeView

  useEffect(() => {
    aiApi.providers().then(r => setAvailableProviders(r.data || { claude: false, gemini: false })).catch(() => {})
  }, [])

  const loadGroupChat = useCallback(async () => {
    const [mr, pr] = await Promise.all([chatApi.messages(), chatApi.presence()])
    const msgs = mr.data || []
    setMessages(msgs)
    setHasOlder(msgs.length >= 100)
    setPresence(pr.data || [])
  }, [])

  const loadDMConversations = useCallback(async () => {
    if (singleUser) return
    const r = await dmApi.list()
    const convs = r.data || []
    setDmConversations(convs)
  }, [singleUser])

  const loadOlderGroupChat = async () => {
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
      loadGroupChat()
      loadDMConversations()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (open && activeView.kind === 'stoa') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, activeView.kind])

  useEffect(() => {
    if (typingUsers.length > 0) typingBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [typingUsers])

  useEffect(() => {
    const onResize = () => setMobile(isMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Handle pendingDM prop — switch to that DM conversation
  useEffect(() => {
    if (!pendingDM || !open) return
    // Ensure we have the conversation in our list (may need to refresh)
    loadDMConversations().then(() => {
      setActiveView({ kind: 'dm', conversationId: pendingDM.conversationId })
      onDMOpened?.()
    })
  }, [pendingDM?.conversationId, open])

  const typingClearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useTypingSSE((data: any) => {
    if (data.typing) {
      setTypingUsers(prev => prev.find(u => u.userId === data.userId)
        ? prev : [...prev, { userId: data.userId, username: data.username }])
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

  useDMSSE((data: any) => {
    const ev = data as { conversationId: string; message: DMMessage }
    const msg: DMMessage = { ...ev.message, own: ev.message.senderId === currentUserId }
    const curView = activeViewRef.current

    // If we're viewing this conversation, push message to the DMView via its ref
    if (curView.kind === 'dm' && curView.conversationId === ev.conversationId && open) {
      const conv = dmConversations.find(c => c.id === ev.conversationId)
      if (conv && (conv as any)._appendDMMessage) {
        ;(conv as any)._appendDMMessage(msg)
        // Already marked read inside DMView.appendMessage
        return
      }
    }

    // Update conversation list: bump unread count and last message
    setDmConversations(prev => {
      const existing = prev.find(c => c.id === ev.conversationId)
      if (existing) {
        const updated = {
          ...existing,
          lastMessage: msg,
          unreadCount: msg.own ? existing.unreadCount : existing.unreadCount + 1,
        }
        return [updated, ...prev.filter(c => c.id !== ev.conversationId)]
      }
      // Unknown conversation — refresh the list
      loadDMConversations()
      return prev
    })
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
      isTypingRef.current = true
      chatApi.typing(true).catch(() => {})
      typingHeartbeatRef.current = setInterval(() => {
        chatApi.typing(true).catch(() => {})
      }, 6000)
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(stopTyping, 8000)
  }

  const sendGroupMessage = async () => {
    const text = input.trim()
    if (!text && !pendingAttachment) return
    setSending(true)
    setInput('')
    const att = pendingAttachment
    setPendingAttachment(null)
    stopTyping()
    try { await chatApi.send(text, att?.id) } finally { setSending(false) }
  }

  const handleGroupKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroupMessage() }
  }

  const onlineCount = presence.filter(u => u.online).length

  const handleDMRead = (conversationId: string) => {
    setDmConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c
    ))
    onDMRead?.()
  }

  // Active DM conversation object
  const activeDMConv = activeView.kind === 'dm'
    ? dmConversations.find(c => c.id === activeView.conversationId) ?? null
    : null

  // Header title for current view
  const headerTitle = activeView.kind === 'stoa' ? '💬 Stoa'
    : activeView.kind === 'ai' ? (AI_PROVIDERS.find(p => p.provider === activeView.provider)?.label ?? 'AI')
    : activeDMConv?.otherUsername ?? 'Direct Message'

  if (!open) return null

  const panelWidth = mobile || maximized ? undefined : 520

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
        width: panelWidth, height: 500,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        animation: 'chat-slide-up 0.2s ease',
      }}>

        {/* Header bar */}
        <div style={{
          padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {headerTitle}
            {activeView.kind === 'stoa' && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                {onlineCount > 0 ? `${onlineCount} online` : ''}
              </span>
            )}
            {activeView.kind === 'dm' && activeDMConv && (
              <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 8,
                color: statusColor(activeDMConv.otherStatus) }}>
                {activeDMConv.otherOnline ? activeDMConv.otherStatus : 'offline'}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
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

        {/* Body: sidebar + content */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* Sidebar */}
          <div style={{
            width: 150, flexShrink: 0, borderRight: '1px solid var(--border)',
            overflowY: 'auto', display: 'flex', flexDirection: 'column',
            padding: '8px 0',
          }}>
            {/* Channels section */}
            <div style={{ padding: '0 8px 4px', fontSize: 9, fontWeight: 700,
              color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Channels
            </div>
            <SidebarItem
              active={activeView.kind === 'stoa'}
              onClick={() => setActiveView({ kind: 'stoa' })}
              icon="💬"
              label="Stoa"
            />
            {AI_PROVIDERS.filter(p => availableProviders[p.provider]).map(p => (
              <SidebarItem
                key={p.provider}
                active={activeView.kind === 'ai' && (activeView as any).provider === p.provider}
                onClick={() => setActiveView({ kind: 'ai', provider: p.provider })}
                icon={p.icon}
                label={p.label}
              />
            ))}

            {/* DMs section — only in multi-user mode */}
            {!singleUser && (
              <>
                <div style={{ margin: '8px 0 4px', borderTop: '1px solid var(--border)' }} />
                <div style={{ padding: '0 8px 4px', fontSize: 9, fontWeight: 700,
                  color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Direct Messages
                </div>
                {dmConversations.length === 0 && (
                  <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    No DMs yet.<br />Start one from the presence widget.
                  </div>
                )}
                {dmConversations.map(conv => (
                  <button key={conv.id}
                    onClick={() => setActiveView({ kind: 'dm', conversationId: conv.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                      border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                      background: activeView.kind === 'dm' && (activeView as any).conversationId === conv.id
                        ? 'var(--accent-bg)' : 'none',
                      borderRadius: 6,
                    }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: conv.otherOnline ? statusColor(conv.otherStatus) : 'var(--border)',
                    }} />
                    <span style={{
                      flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: activeView.kind === 'dm' && (activeView as any).conversationId === conv.id
                        ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: conv.unreadCount > 0 ? 600 : 400,
                    }}>{conv.otherUsername}</span>
                    {conv.unreadCount > 0 && (
                      <span style={{
                        minWidth: 16, height: 16, borderRadius: 8,
                        background: 'var(--red)', color: 'white',
                        fontSize: 9, fontWeight: 700, lineHeight: '16px',
                        textAlign: 'center', padding: '0 3px', boxSizing: 'border-box',
                        flexShrink: 0,
                      }}>{conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Content area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* Stoa tab */}
            {activeView.kind === 'stoa' && (
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
                    {/* Presence strip */}
                    {presence.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 4 }}>
                        {presence.map(u => (
                          <div key={u.userId} title={`${u.username}${u.online ? ' · online' : ''}`}>
                            <UserAvatar username={u.username} avatarUrl={u.avatarUrl} online={u.online} size={20} />
                          </div>
                        ))}
                      </div>
                    )}
                    {hasOlder && (
                      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11 }}
                          onClick={loadOlderGroupChat} disabled={loadingOlder}>
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
                              padding: msg.attachment && !msg.text ? '4px' : '7px 11px',
                              borderRadius: msg.own ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              background: msg.own ? 'var(--accent)' : 'var(--surface2)',
                              color: msg.own ? 'white' : 'var(--text)',
                              fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word',
                              border: msg.own ? 'none' : '1px solid var(--border)',
                              overflow: 'hidden',
                            }}>
                              {msg.attachment && (
                                <AttachmentBubble attachment={msg.attachment}
                                  onDelete={msg.own ? async () => {
                                    await chatApi.deleteAttachment(msg.attachment!.id)
                                    setMessages(prev => prev.map(m =>
                                      m.id === msg.id ? { ...m, attachment: undefined } : m
                                    ))
                                  } : undefined} />
                              )}
                              {msg.text && <Linkify text={msg.text} />}
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
                  <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <AttachButton pending={pendingAttachment}
                        onAttachment={a => setPendingAttachment(a)}
                        onClear={() => setPendingAttachment(null)} />
                      <EmojiPickerButton emojiTheme={emojiTheme}
                        onPick={native => insertAtCursor(inputRef.current, native, setInput)} />
                      <textarea ref={inputRef} value={input} onChange={e => handleInputChange(e.target.value)}
                        onKeyDown={handleGroupKey} placeholder="Message... (Enter to send)"
                        rows={1} style={{
                          flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px',
                          borderRadius: 10, border: '1px solid var(--border)',
                          background: 'var(--surface2)', color: 'var(--text)',
                          fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 80,
                          overflowY: 'auto', outline: 'none',
                        }} />
                      <button onClick={sendGroupMessage}
                        disabled={sending || (!input.trim() && !pendingAttachment)} style={{
                          width: 34, height: 34, borderRadius: '50%', border: 'none',
                          background: (input.trim() || pendingAttachment) ? 'var(--accent)' : 'var(--surface2)',
                          color: (input.trim() || pendingAttachment) ? 'white' : 'var(--text-dim)',
                          cursor: (input.trim() || pendingAttachment) ? 'pointer' : 'default',
                          fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'all 0.15s',
                        }}>↑</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* AI tab */}
            {activeView.kind === 'ai' && (() => {
              const p = AI_PROVIDERS.find(p => p.provider === (activeView as any).provider)
              return p ? <AITab key={p.provider} config={p} /> : null
            })()}

            {/* DM view */}
            {activeView.kind === 'dm' && activeDMConv && (
              <DMView
                key={activeDMConv.id}
                conversation={activeDMConv}
                onMarkRead={handleDMRead}
                emojiTheme={emojiTheme}
              />
            )}

            {/* DM conversation not loaded yet */}
            {activeView.kind === 'dm' && !activeDMConv && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Sidebar item ──────────────────────────────────────────────────────────────
function SidebarItem({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void; icon: string; label: string; badge?: number
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
      border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
      background: active ? 'var(--accent-bg)' : 'none', borderRadius: 6,
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400,
      }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 16, height: 16, borderRadius: 8,
          background: 'var(--red)', color: 'white',
          fontSize: 9, fontWeight: 700, lineHeight: '16px',
          textAlign: 'center', padding: '0 3px', boxSizing: 'border-box',
        }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}
