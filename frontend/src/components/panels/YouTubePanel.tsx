import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface YouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  channelId: string
  publishedAt: string
  thumbnailUrl: string
}

interface YouTubeData {
  channelTitle: string
  profileImageUrl: string
  videoCount: number
  videos: YouTubeVideo[]
  cachedAt?: string
}

const YT_RED = '#FF0000'
const YT_RED_DIM = '#FF000022'

function fmtAge(publishedAt: string): string {
  const diff = Date.now() - new Date(publishedAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VideoRow({ video, onPlay }: { video: YouTubeVideo; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
        borderBottom: '1px solid var(--border)', background: 'none', border: 'none',
        borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
        width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {video.title}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 1 }}>
          <span style={{ fontSize: 10, color: YT_RED, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {video.channelTitle}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            {fmtAge(video.publishedAt)}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>▶</span>
    </button>
  )
}

function VideoCard({ video, onPlay }: { video: YouTubeVideo; onPlay: () => void }) {
  const [thumbError, setThumbError] = useState(false)
  return (
    <button
      onClick={onPlay}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'none', border: '1px solid var(--border)', padding: 0,
        borderRadius: 8, overflow: 'hidden', color: 'inherit',
        transition: 'border-color 0.15s',
      }}
      onMouseOver={e => (e.currentTarget.style.borderColor = YT_RED + '80')}
      onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Thumbnail */}
      {!thumbError && video.thumbnailUrl ? (
        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#0f0f0f' }}>
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            onError={() => setThumbError(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', bottom: 5, right: 6,
            background: 'rgba(0,0,0,0.8)', borderRadius: 3, padding: '1px 5px' }}>
            <span style={{ fontSize: 10, color: '#fff' }}>{fmtAge(video.publishedAt)}</span>
          </div>
        </div>
      ) : (
        <div style={{ paddingBottom: '56.25%', position: 'relative',
          background: 'linear-gradient(135deg, #0f0f0f 0%, #272727 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>▶</span>
          </div>
        </div>
      )}
      {/* Info */}
      <div style={{ padding: '7px 9px', background: 'var(--surface2)' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, marginBottom: 3 }}>
          {video.title}
        </div>
        <div style={{ fontSize: 10, color: YT_RED, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {video.channelTitle}
        </div>
      </div>
    </button>
  )
}

function VideoPlayer({ video, onBack }: { video: YouTubeVideo; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Back bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video.title}
          </div>
          <div style={{ fontSize: 10, color: YT_RED }}>{video.channelTitle}</div>
        </div>
      </div>
      {/* Player */}
      <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
        <iframe
          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function YouTubePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<YouTubeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeVideo, setActiveVideo] = useState<YouTubeVideo | null>(null)

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
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>▶ {error}</div>
  if (!data)   return null

  // Player mode — takes over the whole panel
  if (activeVideo) {
    return <VideoPlayer video={activeVideo} onBack={() => setActiveVideo(null)} />
  }

  const videos = data.videos ?? []

  // ── 1× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const latest = videos[0] ?? null
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        <span style={{ fontSize: 14, color: YT_RED, flexShrink: 0 }}>▶</span>
        {latest ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latest.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {latest.channelTitle} · {fmtAge(latest.publishedAt)}
              </div>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent videos</span>
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
            <img src={data.profileImageUrl} alt={data.channelTitle}
              style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.channelTitle}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
            {videos.length} videos
          </span>
        </div>

        {videos.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent videos</span>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {videos.map(v => (
              <VideoRow key={v.videoId} video={v} onPlay={() => setActiveVideo(v)} />
            ))}
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
          <img src={data.profileImageUrl} alt={data.channelTitle}
            style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
              border: `2px solid ${YT_RED_DIM}` }} />
        )}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.channelTitle}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          padding: '3px 10px', borderRadius: 20,
          background: YT_RED_DIM, border: `1px solid ${YT_RED}40` }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: YT_RED }}>
            {videos.length}
          </span>
        </div>
      </div>

      {videos.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 32, opacity: 0.2 }}>▶</span>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>No recent videos</span>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {videos.map(v => (
              <VideoCard key={v.videoId} video={v} onPlay={() => setActiveVideo(v)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
