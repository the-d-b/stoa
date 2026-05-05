import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface SteamPlayer {
  steamId: string; username: string; avatarUrl: string
  profileUrl: string; onlineState: string; gamePlaying?: string
}
interface SteamGame {
  appId: number; name: string; playtimeMin: number
  recent2wk: number; iconUrl?: string; headerUrl: string
}
interface SteamAchievement {
  appId: number; gameName: string; name: string
  description: string; iconUrl: string; unlocked: number
}
interface SteamFeatured {
  appId: number; name: string; headerUrl: string
  discountPct: number; finalPrice: number
}
interface SteamData {
  player: SteamPlayer
  totalGames: number; totalHours: number
  topPlayed: SteamGame[]; recent: SteamGame[]
  achievements: SteamAchievement[]; featured: SteamFeatured[]
}

function fmtHours(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (h >= 1000) return `${h}h`
  return `${h}h ${m}m`
}

function StateIndicator({ state, game }: { state: string; game?: string }) {
  const color = state === 'online' ? 'var(--green)'
    : state === 'in-game' ? '#57cbde'
    : 'var(--text-dim)'
  const label = state === 'in-game' ? (game || 'In-Game') : state
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color,
        boxShadow: state !== 'offline' ? `0 0 4px ${color}` : 'none' }} />
      <span style={{ color, textTransform: 'capitalize' }}>{label}</span>
    </span>
  )
}

function GameCard({ game, showRecent }: { game: SteamGame; showRecent?: boolean }) {
  const [imgErr, setImgErr] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      {!imgErr ? (
        <img src={game.headerUrl} alt={game.name} onError={() => setImgErr(true)}
          style={{ width: 60, height: 28, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 60, height: 28, borderRadius: 3, background: 'var(--surface2)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16 }}>🎮</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {showRecent && game.recent2wk > 0
            ? `${fmtHours(game.recent2wk)} (2 weeks)`
            : fmtHours(game.playtimeMin)}
        </div>
      </div>
    </div>
  )
}

function ArtworkGrid({ games }: { games: SteamGame[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 4 }}>
      {games.map(g => (
        <a key={g.appId} href={`https://store.steampowered.com/app/${g.appId}`}
          target="_blank" rel="noopener noreferrer">
          <img src={g.headerUrl} alt={g.name}
            style={{ width: '100%', aspectRatio: '460/215', objectFit: 'cover',
              borderRadius: 4, display: 'block', opacity: 0.9 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </a>
      ))}
    </div>
  )
}

export default function SteamPanel({ panel, heightUnits = 2 }: { panel: any; heightUnits?: number }) {
  const [data, setData] = useState<SteamData | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'library'|'recent'|'achievements'|'store'>('library')

  const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()

  useEffect(() => {
    if (!cfg.integrationId) { setError('No Steam integration configured'); return }
    integrationsApi.getPanelData(panel.id)
      .then(r => { setData(r.data); setError('') })
      .catch(e => setError(e.response?.data?.error || 'Failed to load Steam data'))
  }, [panel.config, panel.id])

  if (error) return (
    <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>
      🎮 {error}
    </div>
  )
  if (!data) return (
    <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading Steam data...</div>
  )

  const { player, totalGames, totalHours, topPlayed, recent, achievements, featured } = data

  // ── 1x — compact status bar ────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src={player.avatarUrl} alt={player.username}
        style={{ width: 28, height: 28, borderRadius: 4, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{player.username}</div>
        <StateIndicator state={player.onlineState} game={player.gamePlaying} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
        <div>{totalGames} games</div>
        <div>{Math.round(totalHours)}h</div>
      </div>
    </div>
  )

  // ── 2x–3x — player card + top games ───────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Player */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={player.avatarUrl} alt={player.username}
          style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <a href={player.profileUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
            {player.username}
          </a>
          <div style={{ marginTop: 2 }}>
            <StateIndicator state={player.onlineState} game={player.gamePlaying} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div style={{ fontWeight: 600 }}>{totalGames}</div>
          <div>games</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{Math.round(totalHours)}h</div>
          <div>played</div>
        </div>
      </div>
      {/* Top games artwork */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {topPlayed.slice(0, 5).map(g => (
          <a key={g.appId} href={`https://store.steampowered.com/app/${g.appId}`}
            target="_blank" rel="noopener noreferrer" title={`${g.name} — ${fmtHours(g.playtimeMin)}`}>
            <img src={g.headerUrl} alt={g.name} style={{ height: 46, width: 98,
              objectFit: 'cover', borderRadius: 3, display: 'block', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </a>
        ))}
      </div>
    </div>
  )

  // ── 4x+ — full tabbed view ─────────────────────────────────────────────────
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'library', label: '📚 Library' },
    { id: 'recent', label: '🕹️ Recent' },
    { id: 'achievements', label: '🏆 Achievements' },
    { id: 'store', label: '🏷️ Sales' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Player header */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <img src={player.avatarUrl} alt={player.username}
          style={{ width: 40, height: 40, borderRadius: 5, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <a href={player.profileUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
            {player.username}
          </a>
          <div style={{ marginTop: 1 }}>
            <StateIndicator state={player.onlineState} game={player.gamePlaying} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
          <span style={{ fontWeight: 600 }}>{totalGames}</span> games · <span style={{ fontWeight: 600 }}>{Math.round(totalHours)}</span>h played
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '6px 12px', fontSize: 11, border: 'none', cursor: 'pointer',
              background: 'none', color: tab === t.id ? 'var(--accent2)' : 'var(--text-dim)',
              borderBottom: tab === t.id ? '2px solid var(--accent2)' : '2px solid transparent',
              fontWeight: tab === t.id ? 600 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>

        {tab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { label: 'Total Games', value: totalGames },
                { label: 'Total Hours', value: `${Math.round(totalHours)}h` },
                { label: 'Avg per Game', value: totalGames > 0 ? `${Math.round(totalHours / totalGames)}h` : '—' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8,
                  padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Artwork grid */}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Most Played</div>
            <ArtworkGrid games={topPlayed} />
          </div>
        )}

        {tab === 'recent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recent.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center' }}>
                  No games played in the last 2 weeks
                </div>
              : <>
                  <ArtworkGrid games={recent} />
                  <div style={{ marginTop: 8 }}>
                    {recent.map(g => <GameCard key={g.appId} game={g} showRecent />)}
                  </div>
                </>
            }
          </div>
        )}

        {tab === 'achievements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Recent unlocks from top 3 most-played games
            </div>
            {achievements.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center' }}>
                  No achievements found (profile may be private)
                </div>
              : achievements.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <img src={a.iconUrl} alt={a.name}
                    style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.description}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                      {a.gameName} · {new Date(a.unlocked * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab === 'store' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Current Steam specials</div>
            {featured.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center' }}>
                  No featured sales available
                </div>
              : featured.map(f => (
                <a key={f.appId}
                  href={`https://store.steampowered.com/app/${f.appId}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                    color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <img src={f.headerUrl} alt={f.name}
                    style={{ width: 80, height: 37, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {f.discountPct > 0 && (
                        <span style={{ fontSize: 11, background: '#4c6b22', color: '#a4d007',
                          padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                          -{f.discountPct}%
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        ${f.finalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </a>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
