import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface RomMPlatform {
  id: number
  name: string
  slug: string
  romCount: number
  logoUrl: string
}

interface RomMGame {
  id: number
  name: string
  platform: string
  coverUrl: string
}

interface RomMData {
  totalPlatforms: number
  totalRoms: number
  totalSizeBytes: number
  platforms: RomMPlatform[]
  recentGames: RomMGame[]
}

function fmtBytes(b: number) {
  if (!b) return '0 B'
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(1)} GB`
  return `${(b / 1024 ** 4).toFixed(1)} TB`
}

function Cover({ game, height }: { game: RomMGame; height: number }) {
  const [failed, setFailed] = useState(false)
  const width = Math.round(height * 0.72) // ~3:4 aspect ratio

  return (
    <div
      title={`${game.name}${game.platform ? ' · ' + game.platform : ''}`}
      style={{
        width, height, borderRadius: 5, overflow: 'hidden', flexShrink: 0,
        background: 'var(--surface2)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
      }}
    >
      {!failed && game.coverUrl ? (
        <img
          src={game.coverUrl}
          alt={game.name}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: Math.round(height * 0.22),
          fontWeight: 700, color: 'var(--text-dim)',
          background: `hsl(${(game.name.charCodeAt(0) * 37) % 360} 30% 25%)`,
        }}>
          {game.name.slice(0, 1)}
        </div>
      )}
    </div>
  )
}

function CoverGrid({ games, coverHeight, gap = 5 }: { games: RomMGame[]; coverHeight: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignContent: 'flex-start' }}>
      {games.map(g => <Cover key={g.id} game={g} height={coverHeight} />)}
    </div>
  )
}

function PlatformRow({ p }: { p: RomMPlatform }) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)' }}>
      {p.logoUrl && !imgFailed ? (
        <img src={p.logoUrl} alt={p.name} onError={() => setImgFailed(true)}
          style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 18, height: 18, borderRadius: 3, background: 'var(--surface2)', flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{p.romCount}</span>
    </div>
  )
}

export default function RommPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<RomMData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const games = data.recentGames || []
  const platforms = data.platforms || []

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>RomM</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b>{data.totalRoms.toLocaleString()}</b> ROMs
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {data.totalPlatforms} platforms
        </span>
        {data.totalSizeBytes > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtBytes(data.totalSizeBytes)}</span>
        )}
        {/* Tiny cover strip */}
        <div style={{ display: 'flex', gap: 3, overflow: 'hidden', flex: 1 }}>
          {games.slice(0, 6).map(g => <Cover key={g.id} game={g} height={32} />)}
        </div>
      </div>
    )
  }

  // ── 2-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '10px 12px', gap: 8 }}>
        {/* Stats header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>RomM</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.totalRoms.toLocaleString()} ROMs · {data.totalPlatforms} platforms
            {data.totalSizeBytes > 0 ? ` · ${fmtBytes(data.totalSizeBytes)}` : ''}
          </span>
        </div>
        {/* Cover grid */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <CoverGrid games={games} coverHeight={heightUnits <= 2 ? 80 : 108} gap={5} />
        </div>
      </div>
    )
  }

  // ── 4x+ full ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '12px 14px', gap: 10 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {[
          { label: 'ROMs', value: data.totalRoms.toLocaleString() },
          { label: 'Platforms', value: data.totalPlatforms.toString() },
          { label: 'Library', value: data.totalSizeBytes > 0 ? fmtBytes(data.totalSizeBytes) : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 7,
            padding: '5px 12px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Main content: covers + platform sidebar */}
      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Cover grid */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Recently added
          </div>
          <CoverGrid games={games} coverHeight={120} gap={5} />
        </div>

        {/* Platform sidebar */}
        {platforms.length > 0 && (
          <div style={{ width: 160, flexShrink: 0, overflow: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Platforms
            </div>
            {platforms.slice(0, 20).map(p => <PlatformRow key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  )
}
