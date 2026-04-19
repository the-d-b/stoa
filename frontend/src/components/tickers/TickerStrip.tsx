import { useEffect, useState, useRef, useCallback } from 'react'
import { tickersApi, Ticker } from '../../api'

interface Quote {
  symbol: string
  price: number
  delta: number
  deltaP: number
}

interface TickerStripProps {
  tickers: Ticker[]
  zone: 'header' | 'footer'
  activePorticoId?: string
}

export default function TickerStrip({ tickers, zone, activePorticoId = 'home' }: TickerStripProps) {
  const zoneTickers = tickers
    .filter(t => {
      if (!t.enabled || t.zone !== zone) return false
      // Check portico assignment — empty array means show on all porticos
      const config = (() => { try { return JSON.parse(t.config) } catch { return {} } })()
      const assignedPorticos: string[] = config.porticos || []
      if (assignedPorticos.length === 0) return true // show everywhere
      return assignedPorticos.includes(activePorticoId)
    })
    .sort((a, b) => a.position - b.position)

  if (zoneTickers.length === 0) return null

  return (
    <div style={{
      borderBottom: zone === 'header' ? '1px solid var(--border)' : 'none',
      borderTop: zone === 'footer' ? '1px solid var(--border)' : 'none',
      background: 'var(--surface2)',
    }}>
      {zoneTickers.map(t => <SingleTicker key={t.id} ticker={t} />)}
    </div>
  )
}

function SingleTicker({ ticker }: { ticker: Ticker }) {
  const config = (() => { try { return JSON.parse(ticker.config) } catch { return {} } })()
  const mode: 'static' | 'scroll' = config.mode || 'static'
  const refreshSecs: number = config.refreshSecs || 300

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [rawData, setRawData] = useState<any>(null)
  const [error, setError] = useState('')
  const [swoosh, setSwoosh] = useState(false)
  const isNonQuote = ['weather', 'sports', 'rss'].includes(ticker.type)

  const fetchData = useCallback(async () => {
    try {
      const res = await tickersApi.getData(ticker.id)
      if (isNonQuote) {
        setRawData(res.data)
      } else {
        setQuotes(prev => {
          if (prev.length > 0 && mode === 'static') {
            setSwoosh(true)
            setTimeout(() => { setQuotes(res.data || []); setSwoosh(false) }, 400)
            return prev
          }
          return res.data || []
        })
      }
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    }
  }, [ticker.id, mode, isNonQuote])

  useEffect(() => { fetchData() }, [ticker.id])

  useEffect(() => {
    if (refreshSecs <= 0) return
    const interval = setInterval(fetchData, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [fetchData, refreshSecs])

  if (error) return (
    <div style={{ padding: '4px 24px', fontSize: 11,
      color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>⚠</span><span style={{ fontFamily: 'DM Mono, monospace' }}>{error}</span>
    </div>
  )

  // Weather ticker — show all configured locations
  if (ticker.type === 'weather') {
    if (!rawData) return <div style={{ padding: '6px 24px', fontSize: 11, color: 'var(--text-dim)' }}>Loading...</div>
    // rawData may be a single location or array of locations
    const locations: any[] = Array.isArray(rawData) ? rawData : [rawData]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 16px',
        fontFamily: 'DM Mono, monospace', fontSize: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {locations.map((d: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {i > 0 && <span style={{ color: 'var(--border2)' }}>·</span>}
            <span style={{ color: 'var(--text-muted)' }}>{d.city || 'Weather'}</span>
            <span style={{ fontWeight: 600 }}>{d.temp}</span>
            <span style={{ color: 'var(--text-dim)' }}>{d.precipChance}% precip</span>
          </div>
        ))}
      </div>
    )
  }

  // Sports ticker — grouped by league
  if (ticker.type === 'sports') {
    if (!rawData) return <div style={{ padding: '6px 24px', fontSize: 11, color: 'var(--text-dim)' }}>Loading...</div>
    const games: any[] = rawData.games || []
    const leagues: string[] = rawData.leagues || (rawData.league ? [rawData.league] : ['NBA'])

    // Group games by league
    const byLeague: Record<string, any[]> = {}
    for (const league of leagues) {
      byLeague[league.toUpperCase()] = games.filter((g: any) => g.league === league.toUpperCase())
    }

    if (games.length === 0) return (
      <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
        {leagues.join(' · ')} — no games today
      </div>
    )

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 8px',
        overflowX: 'auto', scrollbarWidth: 'none', flex: 1 }}>
        {Object.entries(byLeague).map(([league, lgGames], li) => {
          if (lgGames.length === 0) return null
          const live = lgGames.filter((g: any) => g.status === 'In Progress')
          const shown = live.length > 0 ? live : lgGames
          return (
            <div key={league} style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
              {li > 0 && <span style={{ color: 'var(--border2)', margin: '0 8px' }}>│</span>}
              <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 8,
                fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{league}</span>
              {shown.slice(0, 4).map((g: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 12,
                  fontFamily: 'DM Mono, monospace', fontSize: 12, flexShrink: 0 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{g.away}</span>
                  {g.awayScore && <span style={{ fontWeight: 600 }}>{g.awayScore}</span>}
                  <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>@</span>
                  {g.homeScore && <span style={{ fontWeight: 600 }}>{g.homeScore}</span>}
                  <span style={{ color: 'var(--text-muted)' }}>{g.home}</span>
                  {g.status === 'In Progress' && (
                    <span style={{ fontSize: 10, color: 'var(--accent)' }}>{g.clock}</span>
                  )}
                  {g.status === 'Final' && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>F</span>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // RSS ticker — always scrolls
  if (ticker.type === 'rss') {
    if (!rawData) return <div style={{ padding: '6px 24px', fontSize: 11, color: 'var(--text-dim)' }}>Loading...</div>
    const headlines: string[] = rawData.headlines || []
    if (headlines.length === 0) return (
      <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--text-dim)' }}>No headlines</div>
    )
    const feedUrl = (() => { try { return JSON.parse(ticker.config).url || '' } catch { return '' } })()
    const items = [...headlines, ...headlines]
    return (
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div style={{
          display: 'flex', gap: 48, whiteSpace: 'nowrap',
          animation: `ticker-scroll ${headlines.length * 6}s linear infinite`,
        }}>
          {items.map((h, i) => (
            feedUrl
              ? <a key={i} href={feedUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0,
                    textDecoration: 'none' }}
                  onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
                  onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                  {h.length > 40 ? h.slice(0, 40) + '…' : h}
                </a>
              : <span key={i} style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{h.length > 40 ? h.slice(0, 40) + '…' : h}</span>
          ))}
        </div>
      </div>
    )
  }

  // Stocks / Crypto (original path)
  if (quotes.length === 0) return (
    <div style={{ padding: '6px 24px', fontSize: 11, color: 'var(--text-dim)' }}>Loading...</div>
  )
  if (mode === 'scroll') return <ScrollingTicker quotes={quotes} />
  return <StaticTicker quotes={quotes} swoosh={swoosh} />
}

// ── Static ticker with swoosh animation ──────────────────────────────────────

function StaticTicker({ quotes, swoosh }: { quotes: Quote[]; swoosh: boolean }) {
  return (
    <div style={{
      padding: '4px 24px',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        animation: swoosh ? 'ticker-swoosh-out 0.4s ease-in forwards' : 'ticker-swoosh-in 0.4s ease-out',
        minWidth: 'max-content',
      }}>
        {quotes.map(q => <QuoteTile key={q.symbol} quote={q} />)}
      </div>
      <style>{`
        @keyframes ticker-swoosh-out {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(-120%); opacity: 0; }
        }
        @keyframes ticker-swoosh-in {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Scrolling ticker ──────────────────────────────────────────────────────────

function ScrollingTicker({ quotes }: { quotes: Quote[] }) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Duplicate quotes for seamless loop
  const items = [...quotes, ...quotes]

  return (
    <div style={{ overflow: 'hidden', padding: '4px 0' }}>
      <div
        ref={trackRef}
        style={{
          display: 'flex', gap: 8, alignItems: 'center',
          animation: `ticker-scroll ${quotes.length * 4}s linear infinite`,
          width: 'max-content',
        }}
      >
        {items.map((q, i) => <QuoteTile key={`${q.symbol}-${i}`} quote={q} />)}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

// ── Quote tile ────────────────────────────────────────────────────────────────

function QuoteTile({ quote }: { quote: Quote }) {
  const up = quote.deltaP >= 0
  const color = up ? 'var(--green)' : 'var(--red)'
  const sign  = up ? '+' : ''

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (p >= 1)    return p.toFixed(2)
    return p.toFixed(4) // crypto sub-dollar
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 6,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {/* Symbol */}
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text)',
        fontFamily: 'DM Mono, monospace', letterSpacing: '0.04em',
      }}>{quote.symbol}</span>

      {/* Separator */}
      <span style={{ width: 1, height: 12, background: 'var(--border)', flexShrink: 0 }} />

      {/* Price */}
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text)',
        fontFamily: 'DM Mono, monospace',
      }}>${formatPrice(quote.price)}</span>

      {/* Delta */}
      <span style={{
        fontSize: 10, color,
        fontFamily: 'DM Mono, monospace',
      }}>
        {sign}{quote.deltaP.toFixed(2)}%
      </span>

      {/* Color indicator dot */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, flexShrink: 0,
      }} />
    </div>
  )
}
