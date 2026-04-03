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
  const [error, setError] = useState('')
  const [swoosh, setSwoosh] = useState(false) // triggers animation

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await tickersApi.getData(ticker.id)
      // Trigger swoosh animation on refresh (not on first load)
      setQuotes(prev => {
        if (prev.length > 0 && mode === 'static') {
          setSwoosh(true)
          setTimeout(() => {
            setQuotes(res.data || [])
            setSwoosh(false)
          }, 400)
          return prev // keep old data during animation
        }
        return res.data || []
      })
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
      console.error(`[Ticker:${ticker.id}]`, e.message)
    }
  }, [ticker.id, mode])

  // Initial load
  useEffect(() => {
    tickersApi.getData(ticker.id)
      .then(res => setQuotes(res.data || []))
      .catch(e => {
        setError(e.response?.data?.error || 'Failed to load')
        console.error(`[Ticker:${ticker.id}]`, e.message)
      })
  }, [ticker.id])

  // Refresh interval
  useEffect(() => {
    if (refreshSecs <= 0) return
    const interval = setInterval(fetchQuotes, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [fetchQuotes, refreshSecs])

  if (error) {
    return (
      <div style={{
        padding: '4px 24px', fontSize: 11,
        color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>⚠</span>
        <span style={{ fontFamily: 'DM Mono, monospace' }}>{error}</span>
      </div>
    )
  }

  if (quotes.length === 0) {
    return (
      <div style={{ padding: '6px 24px', fontSize: 11, color: 'var(--text-dim)' }}>
        Loading...
      </div>
    )
  }

  if (mode === 'scroll') {
    return <ScrollingTicker quotes={quotes} />
  }

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
