import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface SportsPlay {
  text: string; clock: string; period: number; scoreValue: number
}
interface SportsGame {
  id: string; league: string; shortName: string
  homeTeam: string; awayTeam: string
  homeAbbr: string; awayAbbr: string
  homeLogo: string; awayLogo: string
  homeScore: string; awayScore: string
  status: string; statusText: string
  clock: string; period: number
  startTime: string; isFavorite: boolean
  plays?: SportsPlay[]
}
interface SportsStandingTeam {
  name: string; abbr: string; logo: string
  wins: number; losses: number; pct: string; gb: string; isFav: boolean
}
interface SportsStanding {
  league: string; division: string; teams: SportsStandingTeam[]
}
interface LeagueStatus {
  league: string; isOffSeason: boolean; nextSeasonStart?: string
}
interface SportsData {
  games: SportsGame[]; standings: SportsStanding[]
  schedule: any[]; leagueStatus: LeagueStatus[]
  hasLive: boolean; fetchedAt: string
}

const LEAGUE_EMOJI: Record<string,string> = { NHL:'🏒', NFL:'🏈', NBA:'🏀', MLB:'⚾' }

function OffSeasonPlaceholder({ league, nextStart }: { league: string; nextStart?: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', gap:6, padding:'12px 8px', textAlign:'center',
      color:'var(--text-dim)', fontSize:12 }}>
      <span style={{ fontSize:24 }}>{LEAGUE_EMOJI[league] || '🏆'}</span>
      <span style={{ fontWeight:600, color:'var(--text-muted)' }}>{league} Off-Season</span>
      {nextStart && <span style={{ fontSize:11 }}>Season kicks off {nextStart}</span>}
    </div>
  )
}

// Game is "recent" if it started within the past N hours
function isRecent(startTime: string, hours = 6): boolean {
  if (!startTime) return false
  const diff = (Date.now() - new Date(startTime).getTime()) / 3600000
  return diff >= 0 && diff <= hours
}

function periodLabel(league: string, period: number): string {
  if (!period) return ''
  if (league === 'NFL') return ['','1Q','2Q','3Q','4Q','OT'][period] || `P${period}`
  if (league === 'MLB') return period <= 9 ? `${period}` : `E${period-9}`
  const s = period===1?'st':period===2?'nd':period===3?'rd':'th'
  return `${period}${s}`
}

function TeamLogo({ url, abbr, size=24 }: { url:string; abbr:string; size?:number }) {
  const [err, setErr] = useState(false)
  if (err || !url) return (
    <div style={{ width:size, height:size, borderRadius:3, background:'var(--surface2)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.35, fontWeight:700, color:'var(--text-dim)', flexShrink:0 }}>
      {abbr.slice(0,2)}
    </div>
  )
  return <img src={url} alt={abbr} width={size} height={size}
    style={{ objectFit:'contain', flexShrink:0 }} onError={()=>setErr(true)} />
}

function GameRow({ g, compact=false }: { g: SportsGame; compact?: boolean }) {
  const isLive = g.status === 'in'
  const isPre = g.status === 'pre'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6,
      padding: compact ? '2px 0' : '4px 0',
      borderBottom:'1px solid var(--border)', fontSize:12,
      fontWeight: g.isFavorite ? 600 : 400 }}>
      <TeamLogo url={g.awayLogo} abbr={g.awayAbbr} size={compact ? 16 : 20} />
      <span style={{ color:'var(--text-muted)', fontSize:11 }}>{g.awayAbbr}</span>
      {!isPre && <span style={{ fontFamily:'DM Mono, monospace', fontWeight:700 }}>{g.awayScore}</span>}
      <span style={{ color:'var(--text-dim)', fontSize:9 }}>@</span>
      {!isPre && <span style={{ fontFamily:'DM Mono, monospace', fontWeight:700 }}>{g.homeScore}</span>}
      <span style={{ color:'var(--text-muted)', fontSize:11 }}>{g.homeAbbr}</span>
      <TeamLogo url={g.homeLogo} abbr={g.homeAbbr} size={compact ? 16 : 20} />
      <span style={{ flex:1 }} />
      {isLive && <>
        <span style={{ fontSize:10, color:'var(--red)', fontWeight:600 }}>
          {periodLabel(g.league, g.period)}
          {g.league !== 'MLB' && g.clock && g.clock !== '0:00' && g.clock !== '0.0'
            ? ` ${g.clock}` : ''}
        </span>
        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--red)',
          flexShrink:0, animation:'pulse 1.5s infinite' }} />
      </>}
      {g.status === 'post' && <span style={{ fontSize:10, color:'var(--text-dim)' }}>Final</span>}
      {isPre && <span style={{ fontSize:10, color:'var(--text-dim)' }}>
        {new Date(g.startTime).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
      </span>}
    </div>
  )
}

function StandingRow({ t, compact=false, league='' }: { t: SportsStandingTeam; compact?: boolean; league?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:compact?4:6,
      padding: compact ? '1px 0' : '2px 4px', borderRadius:4,
      background: t.isFav ? 'var(--accent-bg)' : 'transparent',
      fontWeight: t.isFav ? 600 : 400 }}>
      <TeamLogo url={t.logo} abbr={t.abbr} size={compact ? 14 : 18} />
      {!compact && <span style={{ fontSize:11, color: t.isFav ? 'var(--accent2)' : 'var(--text-muted)',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{t.name}</span>}
      <span style={{ fontSize:11, fontFamily:'DM Mono, monospace', color:'var(--text-dim)',
        flexShrink:0 }}>{t.wins}-{t.losses}</span>
      {!compact && league !== 'NFL' && t.gb && t.gb !== '0' && t.gb !== '-' && (
        <span style={{ fontSize:10, color:'var(--text-dim)', width:24,
          textAlign:'right', fontFamily:'DM Mono, monospace' }}>{t.gb}GB</span>
      )}
    </div>
  )
}

function PlayByPlay({ plays }: {
  plays: SportsPlay[]
}) {
  if (!plays || plays.length === 0) return (
    <div style={{ fontSize:11, color:'var(--text-dim)', fontStyle:'italic', padding:'4px 0' }}>
      No play data yet
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      {plays.slice(0, 4).map((p, i) => (
        <div key={i} style={{ display:'flex', gap:6, alignItems:'baseline',
          padding:'3px 0', borderBottom:'1px solid var(--border)',
          opacity: i === 0 ? 1 : Math.max(0.35, 1 - i * 0.12) }}>
          <span style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'DM Mono, monospace',
            flexShrink:0, minWidth:36 }}>{p.clock}</span>
          <span style={{ fontSize:12, color: i === 0 ? 'var(--text)' : 'var(--text-muted)',
            flex:1, fontWeight: p.scoreValue > 0 ? 600 : 400 }}>
            {p.scoreValue > 0 && <span style={{ color:'var(--green)', marginRight:4 }}>+{p.scoreValue}</span>}
            {p.text}
          </span>
        </div>
      ))}
    </div>
  )
}

function LiveGameCard({ g }: { g: SportsGame }) {
  const logoSize = 36
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8,
      padding:'10px 0', borderBottom:'2px solid var(--border)' }}>
      {/* Score row */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {/* Away */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
          <TeamLogo url={g.awayLogo} abbr={g.awayAbbr} size={logoSize} />
          <div>
            <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600 }}>{g.awayAbbr}</div>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'DM Mono, monospace',
              lineHeight:1 }}>{g.awayScore}</div>
          </div>
        </div>
        {/* Status */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flexShrink:0 }}>
          <span style={{ fontSize:11, color:'var(--red)', fontWeight:700 }}>
            {periodLabel(g.league, g.period)}
          </span>
          {/* Hide clock for MLB (no game clock), show for others */}
          {g.league !== 'MLB' && g.clock && g.clock !== '0:00' && g.clock !== '0.0' && (
            <span style={{ fontSize:13, fontFamily:'DM Mono, monospace', color:'var(--text)' }}>
              {g.clock}
            </span>
          )}
          <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--red)',
            animation:'pulse 1.5s infinite' }} />
        </div>
        {/* Home */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, justifyContent:'flex-end' }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600 }}>{g.homeAbbr}</div>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'DM Mono, monospace',
              lineHeight:1 }}>{g.homeScore}</div>
          </div>
          <TeamLogo url={g.homeLogo} abbr={g.homeAbbr} size={logoSize} />
        </div>
      </div>
      {/* Play by play */}
      <PlayByPlay plays={g.plays || []} />
    </div>
  )
}

export default function SportsPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<SportsData|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLeague, setSelectedLeague] = useState<string|null>(null)

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  // Auto-refresh: 60s live, 5min otherwise
  useEffect(() => {
    const t = setTimeout(load, data?.hasLive ? 60000 : 300000)
    return () => clearTimeout(t)
  }, [data, load])

  // Auto-select first league
  useEffect(() => {
    if (!data || selectedLeague) return
    const leagues = [...new Set(data.games.map(g => g.league)
      .concat(data.standings.map(s => s.league)))]
    if (leagues.length > 0) setSelectedLeague(leagues[0])
  }, [data])

  if (loading) return <div style={{ padding:16, fontSize:13, color:'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding:16, fontSize:13, color:'var(--text-dim)' }}>🏒 {error}</div>
  if (!data)   return null

  const games = data.games || []
  const standings = data.standings || []
  const statusMap = Object.fromEntries((data.leagueStatus || []).map(s => [s.league, s]))

  // All leagues configured in this integration
  const allLeagues = [...new Set([
    ...games.map(g => g.league),
    ...standings.map(s => s.league),
    ...(data.leagueStatus || []).map(s => s.league),
  ])]

  const offSeasonLeagues = allLeagues.filter(lg => statusMap[lg]?.isOffSeason)
  const activeLeagues = allLeagues.filter(lg => !statusMap[lg]?.isOffSeason)
  const allOffSeason = activeLeagues.length === 0

  // Favorite teams — only from active (non-off-season) leagues
  const favTeams = standings
    .flatMap(s => s.teams.filter(t => t.isFav && !statusMap[s.league]?.isOffSeason))

  // Recent games within past 6h
  const recentGames = games.filter(g =>
    !statusMap[g.league]?.isOffSeason && isRecent(g.startTime, 6))

  // ── All leagues off-season: show banners only, any size ──────────────────
  if (allOffSeason) return (
    <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:8,
      height:'100%', overflow:'auto' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      {offSeasonLeagues.map(lg => (
        <OffSeasonPlaceholder key={lg} league={lg}
          nextStart={statusMap[lg]?.nextSeasonStart} />
      ))}
    </div>
  )

  // ── 1x: fav team logos + records only, centered ─────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding:'0 10px', height:'100%', display:'flex',
        alignItems:'center', justifyContent:'center', gap:10, overflow:'hidden' }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        {favTeams.length === 0
          ? <span style={{ fontSize:12, color:'var(--text-dim)' }}>No favorites configured</span>
          : favTeams.map((t, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                <TeamLogo url={t.logo} abbr={t.abbr} size={22} />
                <span style={{ fontSize:11, fontFamily:'DM Mono, monospace',
                  color:'var(--text-dim)' }}>{t.wins}-{t.losses}</span>
              </div>
            ))
        }
      </div>
    )
  }

  // ── 2x/3x: fav standings + recent games (active leagues only) ────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding:'8px 12px', height:'100%', overflow:'hidden',
        display:'flex', flexDirection:'column', gap:8 }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <div>
          <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase',
            letterSpacing:'0.06em', marginBottom:4 }}>My Teams</div>
          {favTeams.length === 0
            ? <div style={{ fontSize:12, color:'var(--text-dim)' }}>Configure favorite teams in the integration</div>
            : favTeams.map((t,i) => <StandingRow key={i} t={t} league='' />)
          }
        </div>
        {recentGames.length > 0 && (
          <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
            <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase',
              letterSpacing:'0.06em', marginBottom:4 }}>
              {data.hasLive ? 'Live' : 'Recent'}
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {recentGames.map((g,i) => <GameRow key={i} g={g} compact />)}
            </div>
          </div>
        )}
        {/* Off-season banners at bottom for partially-active integrations */}
        {offSeasonLeagues.map(lg => (
          <OffSeasonPlaceholder key={lg} league={lg} nextStart={statusMap[lg]?.nextSeasonStart} />
        ))}
      </div>
    )
  }

  // ── 4x+: league pills + per-league sections ───────────────────────────────
  const [activeLeague, setActiveLeagueState] = [selectedLeague || activeLeagues[0] || allLeagues[0], setSelectedLeague]
  const leagueGames = games.filter(g => g.league === activeLeague)
  const liveGames = leagueGames.filter(g => g.status === 'in')
  const recentLeagueGames = leagueGames.filter(g =>
    g.status === 'post' && isRecent(g.startTime, 72))
  const leagueStandings = standings.filter(s => s.league === activeLeague)
  const activeStatus = statusMap[activeLeague]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      {/* League pills — only if multiple leagues */}
      {allLeagues.length > 1 && (
        <div style={{ display:'flex', gap:4, padding:'8px 12px 0', flexShrink:0,
          flexWrap:'wrap' }}>
          {allLeagues.map(lg => (
            <button key={lg} onClick={() => setActiveLeagueState(lg)} style={{
              padding:'3px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
              background: activeLeague === lg ? 'var(--accent-bg)' : 'transparent',
              border:`1px solid ${activeLeague === lg ? 'var(--accent)' : 'var(--border)'}`,
              color: activeLeague === lg ? 'var(--accent2)' : statusMap[lg]?.isOffSeason ? 'var(--text-dim)' : 'var(--text)',
              fontWeight: activeLeague === lg ? 600 : 400, flexShrink:0,
              opacity: statusMap[lg]?.isOffSeason ? 0.6 : 1,
            }}>{LEAGUE_EMOJI[lg]||''} {lg}</button>
          ))}
          {data.hasLive && (
            <span style={{ marginLeft:'auto', fontSize:10, color:'var(--red)',
              display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--red)',
                animation:'pulse 1.5s infinite' }} />
              LIVE
            </span>
          )}
        </div>
      )}

      <div style={{ flex:1, overflow:'hidden', padding:'8px 12px',
        display:'flex', flexDirection:'column', gap:10, minHeight:0 }}>

        {/* Off-season: show banner for selected league */}
        {activeStatus?.isOffSeason ? (
          <OffSeasonPlaceholder league={activeLeague} nextStart={activeStatus.nextSeasonStart} />
        ) : (
          <>
            {/* Live games with play-by-play — when active, this is all we show */}
            {liveGames.length > 0 ? (
              <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
                {liveGames.map((g,i) => <LiveGameCard key={i} g={g} />)}
              </div>
            ) : (
              <>
                {/* Recent scores — past 3 days */}
                {recentLeagueGames.length > 0 && (
                  <div style={{ flexShrink:0, maxHeight:'30%', overflow:'hidden',
                    display:'flex', flexDirection:'column' }}>
                    <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase',
                      letterSpacing:'0.06em', marginBottom:4 }}>Recent scores</div>
                    <div style={{ overflowY:'auto' }}>
                      {recentLeagueGames.map((g,i) => <GameRow key={i} g={g} compact />)}
                    </div>
                  </div>
                )}
                {/* Standings */}
                <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
                  <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase',
                    letterSpacing:'0.06em', marginBottom:4 }}>Standings</div>
                  <div style={{ overflowY:'auto', flex:1 }}>
                    {leagueStandings.map((div,di) => (
                      <div key={di} style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10, color:'var(--text-dim)', marginBottom:2,
                          fontStyle:'italic' }}>{div.division}</div>
                        {(heightUnits >= 5 ? div.teams : div.teams.slice(0, 7)).map((t,ti) => (
                          <StandingRow key={ti} t={t} league={activeLeague} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}