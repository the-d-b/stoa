import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface TwitchStream {
  userId: string
  userLogin: string
  userName: string
  gameName: string
  title: string
  viewerCount: number
  startedAt: string
  thumbnailUrl: string
  tags?: string[]
  isMature: boolean
}

interface TwitchData {
  userLogin: string
  userName: string
  profileImageUrl: string
  liveCount: number
  streams: TwitchStream[]
}

const TWITCH_PURPLE = '#9146FF'
const TWITCH_PURPLE_DIM = '#9146FF44'

function fmtViewers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function fmtUptime(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: '#EB0400', flexShrink: 0,
      boxShadow: '0 0 5px #EB040099',
    }} />
  )
}

function StreamRow({ stream }: { stream: TwitchStream }) {
  return (
    <a href={`https://twitch.tv/${stream.userLogin}`} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
        borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
      <LiveDot />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stream.userName}
          </span>
          {stream.gameName && (
            <span style={{ fontSize: 10, color: TWITCH_PURPLE, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {stream.gameName}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stream.title}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)',
          fontFamily: 'DM Mono, monospace' }}>{fmtViewers(stream.viewerCount)}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{fmtUptime(stream.startedAt)}</div>
      </div>
    </a>
  )
}

function StreamCard({ stream }: { stream: TwitchStream }) {
  const [thumbError, setThumbError] = useState(false)
  return (
    <a href={`https://twitch.tv/${stream.userLogin}`} target="_blank" rel="noreferrer"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit',
        borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)',
        background: 'var(--surface2)', transition: 'border-color 0.15s' }}
      onMouseOver={e => (e.currentTarget.style.borderColor = TWITCH_PURPLE + '80')}
      onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      {/* Thumbnail */}
      {!thumbError && stream.thumbnailUrl ? (
        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#0e0e10' }}>
          <img
            src={stream.thumbnailUrl}
            alt={stream.userName}
            onError={() => setThumbError(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover' }}
          />
          {/* Viewer badge overlay */}
          <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex',
            alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.75)',
            borderRadius: 4, padding: '2px 6px' }}>
            <LiveDot />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff',
              fontFamily: 'DM Mono, monospace' }}>
              {fmtViewers(stream.viewerCount)}
            </span>
          </div>
          {/* Uptime badge overlay */}
          <div style={{ position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 6px' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>
              {fmtUptime(stream.startedAt)}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ paddingBottom: '56.25%', position: 'relative',
          background: 'linear-gradient(135deg, #0e0e10 0%, #1f1f23 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>📺</span>
          </div>
        </div>
      )}
      {/* Info */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stream.userName}
          </span>
        </div>
        {stream.gameName && (
          <div style={{ fontSize: 10, color: TWITCH_PURPLE, marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stream.gameName}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stream.title}</div>
      </div>
    </a>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TwitchPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TwitchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>📺 {error}</div>
  if (!data)   return null

  const streams = data.streams ?? []
  const top = streams[0] ?? null

  // ── 1× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {data.liveCount > 0 ? (
          <>
            <LiveDot />
            <span style={{ fontSize: 14, fontWeight: 700, color: TWITCH_PURPLE,
              fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{data.liveCount}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>live</span>
            {top && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.userName}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {top.gameName} · {fmtViewers(top.viewerCount)} viewers
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: 14 }}>📺</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              No followed channels live
            </span>
          </>
        )}
      </div>
    )
  }

  // ── 2–3× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {data.profileImageUrl && (
            <img src={data.profileImageUrl} alt={data.userLogin}
              style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
          )}
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {data.userName}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
              @{data.userLogin}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {data.liveCount > 0 && <LiveDot />}
            <span style={{ fontSize: 12, fontWeight: data.liveCount > 0 ? 700 : 400,
              color: data.liveCount > 0 ? TWITCH_PURPLE : 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace' }}>
              {data.liveCount}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>live</span>
          </div>
        </div>

        {streams.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              No followed channels live right now
            </span>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {streams.map((s, i) => <StreamRow key={i} stream={s} />)}
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {data.profileImageUrl && (
          <img src={data.profileImageUrl} alt={data.userLogin}
            style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
              border: `2px solid ${TWITCH_PURPLE_DIM}` }} />
        )}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {data.userName}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
            @{data.userLogin}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          padding: '3px 10px', borderRadius: 20,
          background: data.liveCount > 0 ? TWITCH_PURPLE + '18' : 'var(--surface2)',
          border: `1px solid ${data.liveCount > 0 ? TWITCH_PURPLE + '40' : 'var(--border)'}` }}>
          {data.liveCount > 0 && <LiveDot />}
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace',
            color: data.liveCount > 0 ? TWITCH_PURPLE : 'var(--text-dim)' }}>
            {data.liveCount}
          </span>
          <span style={{ fontSize: 11, color: data.liveCount > 0 ? TWITCH_PURPLE : 'var(--text-dim)' }}>
            live
          </span>
        </div>
      </div>

      {streams.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 32, opacity: 0.2 }}>📺</span>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            No followed channels live right now
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {/* 2-column thumbnail grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {streams.map((s, i) => <StreamCard key={i} stream={s} />)}
          </div>
        </div>
      )}
    </div>
  )
}
