import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface BazarrProvider {
  name: string
  status: string // "Good" or issue description
  retry: string
  ok: boolean
}

interface BazarrData {
  uiUrl: string
  integrationId: string
  version: string
  missingEpisodes: number
  missingMovies: number
  healthIssues: number
  providers: BazarrProvider[]
  providersTotal: number
  providersOk: number
  providersIssues: number
  downloadedSeries: number
  downloadedMovies: number
  sonarrLive: boolean
  radarrLive: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function providerDisplayName(name: string): string {
  const map: Record<string, string> = {
    opensubtitlescom: 'OpenSubtitles.com',
    opensubtitles: 'OpenSubtitles',
    subscene: 'Subscene',
    addic7ed: 'Addic7ed',
    legendasdivx: 'LegendasDivX',
    legendastv: 'LegendasTV',
    napiprojekt: 'NapiProjekt',
    podnapisi: 'Podnapisi',
    shooter: 'Shooter',
    subdivx: 'SubDivX',
    subf2m: 'Subf2m',
    subliminal: 'Subliminal',
    supersubtitles: 'SuperSubtitles',
    titlovi: 'Titlovi',
    tvsubtitles: 'TVSubtitles',
    wizdom: 'Wizdom',
    yifysubtitles: 'YifySubtitles',
    zimuku: 'Zimuku',
    embeddedsubtitles: 'Embedded',
    gestdown: 'Gestdown',
    hosszupuska: 'Hosszupuska',
    karagarga: 'KaraGarga',
    ktuvit: 'Ktuvit',
    nekur: 'Nekur',
    sous_titres_eu: 'sous-titres.eu',
  }
  return map[name?.toLowerCase()] ?? name ?? 'Unknown'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, color, bg }: {
  label: string; value: string | number; color?: string; bg?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 10px', borderRadius: 8,
      background: bg || 'var(--surface2)', border: '1px solid var(--border)', minWidth: 60,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: color || 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function MissingDonut({ episodes, movies, size = 80 }: { episodes: number; movies: number; size?: number }) {
  const total = episodes + movies
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  // Show episodes arc in amber, movies in cyan
  const epFrac = total > 0 ? episodes / total : 0
  const epLen = circ * epFrac
  const mvLen = circ * (1 - epFrac)
  const color = total === 0 ? '#4ade80' : total < 10 ? '#f59e0b' : '#e53e3e'

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4ade80" strokeWidth={size * 0.13} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="#4ade80" style={{ fontSize: size * 0.2, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
          ✓
        </text>
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      {/* Episodes arc */}
      {episodes > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth={size * 0.13}
          strokeDasharray={`${epLen} ${circ}`} strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`} />
      )}
      {/* Movies arc */}
      {movies > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22d3ee" strokeWidth={size * 0.13}
          strokeDasharray={`${mvLen} ${circ}`} strokeLinecap="butt"
          strokeDashoffset={-epLen}
          transform={`rotate(-90 ${cx} ${cy})`} />
      )}
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill={color} style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {total}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.11 }}>
        missing
      </text>
    </svg>
  )
}

function ProviderRow({ provider }: { provider: BazarrProvider }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: provider.ok ? '#4ade80' : '#e53e3e',
      }} />
      <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {providerDisplayName(provider.name)}
      </span>
      {!provider.ok && provider.status && provider.status !== 'Good' && (
        <span style={{ fontSize: 10, color: '#e53e3e', flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}
          title={provider.status}>
          {provider.status.split(':')[0]}
        </span>
      )}
      {!provider.ok && provider.retry && provider.retry !== '-' && (
        <span style={{ fontSize: 9, color: '#f59e0b', fontFamily: 'DM Mono, monospace',
          flexShrink: 0, whiteSpace: 'nowrap' }}>
          retry {provider.retry}
        </span>
      )}
    </div>
  )
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
      borderBottom: '1px solid var(--border)', paddingBottom: 3 }}>
      {children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BazarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<BazarrData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string = config.integrationId || ''

  useEffect(() => {
    if (!integrationId) { setLoading(false); return }
    integrationsApi.getPanelData(panel.id)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(e => { setError(e.response?.data?.error || e.message || 'Failed to load'); setLoading(false) })
  }, [panel.id, integrationId])

  if (!integrationId) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No integration configured.</div>
  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
  if (error) return <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>
  if (!data) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No data</div>

  const {
    missingEpisodes, missingMovies, healthIssues,
    providers = [], providersTotal, providersOk, providersIssues,
    downloadedSeries, downloadedMovies, version, sonarrLive, radarrLive,
  } = data

  const totalMissing = missingEpisodes + missingMovies
  const providersAllOk = providersTotal > 0 && providersIssues === 0
  const providerColor = providersTotal === 0 ? 'var(--text-dim)' : providersAllOk ? '#4ade80' : '#e53e3e'
  const missingColor = totalMissing === 0 ? '#4ade80' : totalMissing < 10 ? '#f59e0b' : '#e53e3e'

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%',
            background: totalMissing === 0 ? '#4ade80' : missingColor }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {totalMissing === 0 ? 'No missing subtitles' : `${totalMissing} missing`}
          </span>
        </div>
        {missingEpisodes > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: '#f59e0b' }}>{missingEpisodes} TV</span>
        </>}
        {missingMovies > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: '#22d3ee' }}>{missingMovies} movies</span>
        </>}
        {providersIssues > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
            {providersIssues} provider{providersIssues !== 1 ? 's' : ''} down
          </span>
        </>}
        {version && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            v{version}
          </span>
        </>}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Donut + chips */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <MissingDonut episodes={missingEpisodes} movies={missingMovies} size={80} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            {missingEpisodes > 0 && <StatChip label="TV missing" value={missingEpisodes} color="#f59e0b" bg="#f59e0b12" />}
            {missingMovies > 0 && <StatChip label="Movies missing" value={missingMovies} color="#22d3ee" bg="#22d3ee12" />}
            {totalMissing === 0 && <StatChip label="Missing" value="None" color="#4ade80" />}
            {providersIssues > 0 && <StatChip label="Providers down" value={providersIssues} color="#e53e3e" bg="#e53e3e18" />}
            {providersOk > 0 && <StatChip label="Providers ok" value={`${providersOk}/${providersTotal}`} color="#4ade80" />}
            {downloadedSeries + downloadedMovies > 0 && (
              <StatChip label="This month" value={downloadedSeries + downloadedMovies} />
            )}
            {version && <StatChip label="Version" value={`v${version}`} />}
          </div>
        </div>

        {/* Providers */}
        {providers.length > 0 && (
          <div>
            <ColHeader>
              Providers ({providersIssues > 0 ? `${providersIssues} issue${providersIssues !== 1 ? 's' : ''}` : `${providersOk} ok`})
            </ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {providers.map((p, i) => <ProviderRow key={i} provider={p} />)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Donut + chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <MissingDonut episodes={missingEpisodes} movies={missingMovies} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {totalMissing === 0
            ? <StatChip label="Missing" value="None" color="#4ade80" />
            : <>
                {missingEpisodes > 0 && <StatChip label="TV missing" value={missingEpisodes} color="#f59e0b" bg="#f59e0b12" />}
                {missingMovies > 0 && <StatChip label="Movies missing" value={missingMovies} color="#22d3ee" bg="#22d3ee12" />}
              </>
          }
          {providersIssues > 0 && <StatChip label="Providers down" value={providersIssues} color="#e53e3e" bg="#e53e3e18" />}
          <StatChip label="Providers" value={`${providersOk}/${providersTotal}`} color={providerColor} />
          {downloadedSeries > 0 && <StatChip label="TV subs/mo" value={downloadedSeries} />}
          {downloadedMovies > 0 && <StatChip label="Movie subs/mo" value={downloadedMovies} />}
          {version && <StatChip label="Version" value={`v${version}`} />}
        </div>
      </div>

      {/* Two-column: providers | instance detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Col 1: Providers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>
            Providers ({providersTotal}){providersIssues > 0 ? ` — ${providersIssues} issue${providersIssues !== 1 ? 's' : ''}` : ''}
          </ColHeader>
          {providers.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None configured</div>
            : providers.map((p, i) => <ProviderRow key={i} provider={p} />)
          }
        </div>

        {/* Col 2: Instance info + download breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Instance</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {version && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                Version: v{version}
              </div>
            )}
            {/* Sonarr/Radarr live status */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%',
                  background: sonarrLive ? '#4ade80' : 'var(--text-dim)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sonarr</span>
                <span style={{ fontSize: 10, color: sonarrLive ? '#4ade80' : 'var(--text-dim)' }}>
                  {sonarrLive ? 'live' : 'offline'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%',
                  background: radarrLive ? '#4ade80' : 'var(--text-dim)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Radarr</span>
                <span style={{ fontSize: 10, color: radarrLive ? '#4ade80' : 'var(--text-dim)' }}>
                  {radarrLive ? 'live' : 'offline'}
                </span>
              </div>
            </div>
            {healthIssues > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e53e3e' }} />
                <span style={{ fontSize: 11, color: '#e53e3e' }}>
                  {healthIssues} health issue{healthIssues !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {/* Download breakdown */}
            {(downloadedSeries > 0 || downloadedMovies > 0) && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                  letterSpacing: '0.04em', marginBottom: 4 }}>
                  Downloaded (last 30 days)
                </div>
                {downloadedSeries > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 50 }}>TV</span>
                    <div style={{ flex: 1, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2, background: '#f59e0b',
                        width: `${Math.min(100, downloadedSeries / Math.max(downloadedSeries, downloadedMovies) * 100)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace',
                      color: 'var(--text-muted)', width: 30, textAlign: 'right' }}>
                      {downloadedSeries}
                    </span>
                  </div>
                )}
                {downloadedMovies > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 50 }}>Movies</span>
                    <div style={{ flex: 1, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2, background: '#22d3ee',
                        width: `${Math.min(100, downloadedMovies / Math.max(downloadedSeries, downloadedMovies) * 100)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace',
                      color: 'var(--text-muted)', width: 30, textAlign: 'right' }}>
                      {downloadedMovies}
                    </span>
                  </div>
                )}
              </div>
            )}
            {/* Missing subtitle legend */}
            {totalMissing > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                  letterSpacing: '0.04em', marginBottom: 4 }}>
                  Missing subtitles
                </div>
                {missingEpisodes > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {missingEpisodes} TV episode{missingEpisodes !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {missingMovies > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {missingMovies} movie{missingMovies !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
