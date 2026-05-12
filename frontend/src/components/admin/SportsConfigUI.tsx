import { useState } from 'react'

const LEAGUE_OPTIONS = [
  { id: 'nhl', label: '🏒 NHL' },
  { id: 'nfl', label: '🏈 NFL' },
  { id: 'nba', label: '🏀 NBA' },
  { id: 'mlb', label: '⚾ MLB' },
]

const TEAM_OPTIONS: Record<string, {abbr: string; name: string}[]> = {
  nhl: [
    {abbr:'COL',name:'Avalanche'},{abbr:'SJS',name:'Sharks'},{abbr:'EDM',name:'Oilers'},
    {abbr:'CGY',name:'Flames'},{abbr:'VGK',name:'Golden Knights'},{abbr:'LAK',name:'Kings'},
    {abbr:'ANA',name:'Ducks'},{abbr:'SEA',name:'Kraken'},{abbr:'VAN',name:'Canucks'},
    {abbr:'MIN',name:'Wild'},{abbr:'NSH',name:'Predators'},{abbr:'STL',name:'Blues'},
    {abbr:'CHI',name:'Blackhawks'},{abbr:'WPG',name:'Jets'},{abbr:'DAL',name:'Stars'},
    {abbr:'BOS',name:'Bruins'},{abbr:'TBL',name:'Lightning'},{abbr:'FLA',name:'Panthers'},
    {abbr:'TOR',name:'Maple Leafs'},{abbr:'MTL',name:'Canadiens'},{abbr:'OTT',name:'Senators'},
    {abbr:'BUF',name:'Sabres'},{abbr:'DET',name:'Red Wings'},{abbr:'CBJ',name:'Blue Jackets'},
    {abbr:'PIT',name:'Penguins'},{abbr:'PHI',name:'Flyers'},{abbr:'NJD',name:'Devils'},
    {abbr:'NYR',name:'Rangers'},{abbr:'NYI',name:'Islanders'},{abbr:'WSH',name:'Capitals'},
    {abbr:'CAR',name:'Hurricanes'},{abbr:'UTA',name:'Utah HC'},
  ],
  nfl: [
    {abbr:'DEN',name:'Broncos'},{abbr:'DAL',name:'Cowboys'},{abbr:'KC',name:'Chiefs'},
    {abbr:'BUF',name:'Bills'},{abbr:'SF',name:'49ers'},{abbr:'PHI',name:'Eagles'},
    {abbr:'BAL',name:'Ravens'},{abbr:'CIN',name:'Bengals'},{abbr:'LAC',name:'Chargers'},
    {abbr:'LV',name:'Raiders'},{abbr:'SEA',name:'Seahawks'},{abbr:'LAR',name:'Rams'},
    {abbr:'ARI',name:'Cardinals'},{abbr:'MIN',name:'Vikings'},{abbr:'GB',name:'Packers'},
    {abbr:'CHI',name:'Bears'},{abbr:'DET',name:'Lions'},{abbr:'NO',name:'Saints'},
    {abbr:'TB',name:'Buccaneers'},{abbr:'ATL',name:'Falcons'},{abbr:'CAR',name:'Panthers'},
    {abbr:'NYG',name:'Giants'},{abbr:'NYJ',name:'Jets'},{abbr:'NE',name:'Patriots'},
    {abbr:'MIA',name:'Dolphins'},{abbr:'PIT',name:'Steelers'},{abbr:'CLE',name:'Browns'},
    {abbr:'HOU',name:'Texans'},{abbr:'IND',name:'Colts'},{abbr:'TEN',name:'Titans'},
    {abbr:'JAX',name:'Jaguars'},{abbr:'WAS',name:'Commanders'},
  ],
  nba: [
    {abbr:'DEN',name:'Nuggets'},{abbr:'DAL',name:'Mavericks'},{abbr:'GSW',name:'Warriors'},
    {abbr:'LAL',name:'Lakers'},{abbr:'BOS',name:'Celtics'},{abbr:'MIL',name:'Bucks'},
    {abbr:'MIA',name:'Heat'},{abbr:'PHX',name:'Suns'},{abbr:'LAC',name:'Clippers'},
    {abbr:'MEM',name:'Grizzlies'},{abbr:'OKC',name:'Thunder'},{abbr:'SAC',name:'Kings'},
    {abbr:'NOP',name:'Pelicans'},{abbr:'MIN',name:'Timberwolves'},{abbr:'CLE',name:'Cavaliers'},
    {abbr:'NYK',name:'Knicks'},{abbr:'PHI',name:'76ers'},{abbr:'ATL',name:'Hawks'},
    {abbr:'CHI',name:'Bulls'},{abbr:'BKN',name:'Nets'},{abbr:'TOR',name:'Raptors'},
    {abbr:'IND',name:'Pacers'},{abbr:'WAS',name:'Wizards'},{abbr:'CHA',name:'Hornets'},
    {abbr:'DET',name:'Pistons'},{abbr:'ORL',name:'Magic'},{abbr:'HOU',name:'Rockets'},
    {abbr:'SAS',name:'Spurs'},{abbr:'UTA',name:'Jazz'},{abbr:'POR',name:'Trail Blazers'},
  ],
  mlb: [
    {abbr:'COL',name:'Rockies'},{abbr:'LAD',name:'Dodgers'},{abbr:'SF',name:'Giants'},
    {abbr:'SD',name:'Padres'},{abbr:'ARI',name:'Diamondbacks'},{abbr:'SEA',name:'Mariners'},
    {abbr:'HOU',name:'Astros'},{abbr:'TEX',name:'Rangers'},{abbr:'BOS',name:'Red Sox'},
    {abbr:'NYY',name:'Yankees'},{abbr:'NYM',name:'Mets'},{abbr:'CHC',name:'Cubs'},
    {abbr:'CHW',name:'White Sox'},{abbr:'DET',name:'Tigers'},{abbr:'MIN',name:'Twins'},
    {abbr:'CLE',name:'Guardians'},{abbr:'KC',name:'Royals'},{abbr:'ATL',name:'Braves'},
    {abbr:'MIA',name:'Marlins'},{abbr:'PHI',name:'Phillies'},{abbr:'WSH',name:'Nationals'},
    {abbr:'STL',name:'Cardinals'},{abbr:'MIL',name:'Brewers'},{abbr:'CIN',name:'Reds'},
    {abbr:'PIT',name:'Pirates'},{abbr:'TB',name:'Rays'},{abbr:'TOR',name:'Blue Jays'},
    {abbr:'BAL',name:'Orioles'},{abbr:'OAK',name:'Athletics'},{abbr:'LAA',name:'Angels'},
  ],
}

export default function SportsConfigUI({ apiUrl, onChange }: {
  apiUrl: string; onChange: (v: string) => void
}) {
  const cfg = (() => { try { return JSON.parse(apiUrl || '{}') } catch { return {} } })()
  const [leagues, setLeagues] = useState<string[]>(cfg.leagues || ['nhl', 'nfl'])
  const [teams, setTeams] = useState<string[]>(cfg.teams || [])
  const [daysAhead, setDaysAhead] = useState<number>(cfg.daysAhead || 28)

  const emit = (l: string[], t: string[], d: number) =>
    onChange(JSON.stringify({ leagues: l, teams: t, daysAhead: d }))

  const toggleLeague = (id: string) => {
    const next = leagues.includes(id) ? leagues.filter(x => x !== id) : [...leagues, id]
    setLeagues(next); emit(next, teams, daysAhead)
  }

  const toggleTeam = (abbr: string) => {
    const next = teams.includes(abbr) ? teams.filter(x => x !== abbr) : [...teams, abbr]
    setTeams(next); emit(leagues, next, daysAhead)
  }

  const allTeams = leagues.flatMap(l => (TEAM_OPTIONS[l] || []).map(t => ({ ...t, league: l })))
    .filter((t, i, arr) => arr.findIndex(x => x.abbr === t.abbr) === i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label className="label">Leagues</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {LEAGUE_OPTIONS.map(l => {
            const on = leagues.includes(l.id)
            return (
              <button key={l.id} type="button" onClick={() => toggleLeague(l.id)}
                style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
                {on ? '✓ ' : ''}{l.label}
              </button>
            )
          })}
        </div>
      </div>

      {allTeams.length > 0 && (
        <div>
          <label className="label">
            Favorite teams{' '}
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(highlighted on panel)</span>
          </label>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap',
            maxHeight: 120, overflowY: 'auto' }}>
            {allTeams.map(t => {
              const on = teams.includes(t.abbr)
              return (
                <button key={t.abbr} type="button" onClick={() => toggleTeam(t.abbr)}
                  style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                    background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
                  {on ? '✓ ' : ''}{t.abbr}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Schedule days ahead</label>
        <select className="input" style={{ maxWidth: 120, cursor: 'pointer' }}
          value={daysAhead}
          onChange={e => {
            const d = Number(e.target.value)
            setDaysAhead(d); emit(leagues, teams, d)
          }}>
          {[7, 14, 28].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        No API key required. Data from ESPN (unofficial, no authentication needed).
      </div>
    </div>
  )
}
