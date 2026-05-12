import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface MarketQuote {
  symbol: string; name: string; price: number
  delta: number; deltaP: number
  marketCap?: number; volume?: number
  high52?: number; low52?: number
  isCrypto: boolean
}
interface SparkPoint { t: number; p: number }
interface MarketData {
  quotes: MarketQuote[]
  sparks: Record<string, SparkPoint[]>
  fetchedAt: string
}

const RANGES = [
  { label: '1D', yahooInterval: '5m',  yahooRange: '1d',  cgDays: 1    },
  { label: '5D', yahooInterval: '30m', yahooRange: '5d',  cgDays: 7    },
  { label: '1M', yahooInterval: '1d',  yahooRange: '1mo', cgDays: 30   },
  { label: '3M', yahooInterval: '1d',  yahooRange: '3mo', cgDays: 90   },
  { label: '1Y', yahooInterval: '1wk', yahooRange: '1y',  cgDays: 365  },
  { label: '5Y', yahooInterval: '1mo', yahooRange: '5y',  cgDays: 365  }, // Demo plan max
]

function fmt(n: number): string {
  if (n >= 1e12) return `$${(n/1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n/1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n/1e6).toFixed(2)}M`
  if (n >= 1)    return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  if (n >= 0.0001) return `$${n.toFixed(6)}`
  return `$${n.toFixed(8)}` // SHIB-level prices
}
function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` }
function deltaColor(n: number) { return n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text-dim)' }

function Sparkline({ points, height = 40 }: { points: SparkPoint[]; height?: number }) {
  if (points.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 10 }}>—</div>
  const prices = points.map(p => p.p)
  // Use spark trend (first vs last) for color, not 24h change
  const positive = points[points.length - 1].p >= points[0].p
  const min = Math.min(...prices), max = Math.max(...prices)
  const range = max - min || 1
  const w = 400, pad = 2
  const pts = points.map((p, i) => `${pad + (i/(points.length-1))*(w-pad*2)},${pad+((max-p.p)/range)*(height-pad*2)}`).join(' ')
  const color = positive ? '#4ade80' : '#f87171'
  const [fx] = pts.split(' ')[0].split(',')
  const [lx] = pts.split(' ').slice(-1)[0].split(',')
  const fill = `M${fx},${height} L${pts.split(' ').join(' L')} L${lx},${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${positive?'u':'d'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg${positive?'u':'d'})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function QuoteRow({ q, sparks, selected, onClick }: {
  q: MarketQuote; sparks: Record<string, SparkPoint[]>; selected: boolean; onClick: () => void
}) {
  const pts = sparks[q.symbol] || []
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 8px', borderRadius: 7, cursor: 'pointer',
      background: selected ? 'var(--surface2)' : 'transparent',
      border: `1px solid ${selected ? 'var(--border2)' : 'transparent'}` }}>
      <div style={{ width: 44, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{q.symbol}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{q.isCrypto ? '🪙' : '📈'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Sparkline points={pts.slice(-50)} height={26} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{fmt(q.price)}</div>
        <div style={{ fontSize: 11, color: deltaColor(q.deltaP) }}>{fmtPct(q.deltaP)}</div>
      </div>
    </div>
  )
}

function QuoteDetail({ q, sparks, range, onRangeChange }: {
  q: MarketQuote; sparks: Record<string, SparkPoint[]>; range: string; onRangeChange: (r: string) => void
}) {
  const pts = sparks[q.symbol] || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'DM Mono, monospace' }}>{q.symbol}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{q.name}</span>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{fmt(q.price)}</span>
        <span style={{ fontSize: 12, color: deltaColor(q.deltaP), fontWeight: 600 }}>
          {fmt(Math.abs(q.delta))} ({fmtPct(q.deltaP)})
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {RANGES.filter(r => !q.isCrypto || r.label !== '5Y').map(r => (
          <button key={r.label} onClick={() => onRangeChange(r.label)} style={{
            padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
            background: range === r.label ? 'var(--accent-bg)' : 'transparent',
            border: `1px solid ${range === r.label ? 'var(--accent)' : 'var(--border)'}`,
            color: range === r.label ? 'var(--accent2)' : 'var(--text-dim)',
            fontWeight: range === r.label ? 700 : 400 }}>{r.label}</button>
        ))}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 60 }}>
        <Sparkline points={pts} height={80} />
        {pts.length >= 2 && (
          <div style={{ position: 'absolute', top: 2, left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
              background: 'var(--surface)', padding: '0 3px', borderRadius: 3 }}>
              {fmt(pts[0].p)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
              background: 'var(--surface)', padding: '0 3px', borderRadius: 3 }}>
              {fmt(pts[pts.length-1].p)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
        {q.marketCap ? <span style={{ color: 'var(--text-dim)' }}>Mkt Cap <strong style={{ color: 'var(--text)' }}>{fmt(q.marketCap)}</strong></span> : null}
        {q.volume ? <span style={{ color: 'var(--text-dim)' }}>Vol <strong style={{ color: 'var(--text)' }}>{fmt(q.volume)}</strong></span> : null}
        {q.high52 ? <span style={{ color: 'var(--text-dim)' }}>52W H <strong style={{ color: 'var(--green)' }}>{fmt(q.high52)}</strong></span> : null}
        {q.low52 ? <span style={{ color: 'var(--text-dim)' }}>52W L <strong style={{ color: 'var(--red)' }}>{fmt(q.low52)}</strong></span> : null}
      </div>
    </div>
  )
}

export default function MarketPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [range, setRange] = useState('1M')
  const [customSparks, setCustomSparks] = useState<Record<string, SparkPoint[]>>({})
  const [loadingSpark, setLoadingSpark] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data); setError('')
      if (!selected && r.data?.quotes?.length > 0) setSelected(r.data.quotes[0].symbol)
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to load') }
    finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setTimeout(load, 5 * 60 * 1000); return () => clearTimeout(t) }, [data, load])

  const handleRangeChange = async (newRange: string) => {
    setRange(newRange)
    if (!selected || !data) return
    const q = data.quotes.find(q => q.symbol === selected)
    if (!q) return

    if (q.isCrypto) {
      // Crypto sparks pre-cached in backend as SYMBOL-RANGE -- just update range state
      return
    }

    // Stocks -- fetch via backend proxy (Yahoo Finance blocks browser CORS)
    const key = `${selected}-${newRange}`
    if (customSparks[key]) return
    const rd = RANGES.find(r => r.label === newRange)
    if (!rd) return
    setLoadingSpark(true)
    try {
      const token = localStorage.getItem('stoa_token') || ''
      const resp = await fetch(
        `/api/market/spark?symbol=${q.symbol}&interval=${rd.yahooInterval}&range=${rd.yahooRange}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (resp.ok) {
        const json = await resp.json()
        const points = json.points || []
        if (points.length > 0) setCustomSparks(prev => ({ ...prev, [key]: points }))
      }
    } catch (e) {
      console.error('Spark fetch error:', e)
    } finally { setLoadingSpark(false) }
  }

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>📈 {error}</div>
  if (!data || data.quotes.length === 0) return (
    <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>No symbols configured.</div>
  )

  const selectedQuote = data.quotes.find(q => q.symbol === selected) || data.quotes[0]
  // For crypto: backend pre-caches SYMBOL-RANGE keys, read directly
  // For stocks: use customSparks fetched via backend proxy
  const sparkKey = selected ? `${selected}-${range}` : ''
  const sparksToUse = (() => {
    if (!selected) return data.sparks
    // Check if backend has pre-cached this range (crypto)
    if (data.sparks[sparkKey]) {
      return { ...data.sparks, [selected]: data.sparks[sparkKey] }
    }
    // Fall back to custom fetched (stocks)
    if (customSparks[sparkKey]) {
      return { ...data.sparks, [selected]: customSparks[sparkKey] }
    }
    return data.sparks
  })()

  // 1x — compact wrapped list
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center',
      flexWrap: 'wrap', gap: '2px 14px', padding: '4px 10px', overflowY: 'auto', alignContent: 'center' }}>
      {data.quotes.map(q => (
        <div key={q.symbol} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{q.symbol}</span>
          <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace' }}>{fmt(q.price)}</span>
          <span style={{ fontSize: 10, color: deltaColor(q.deltaP) }}>{fmtPct(q.deltaP)}</span>
        </div>
      ))}
    </div>
  )

  // 2x — list without sparklines
  if (heightUnits <= 2) return (
    <div style={{ padding: '6px 8px', height: '100%', overflowY: 'auto' }}>
      {data.quotes.map(q => (
        <div key={q.symbol} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px', fontSize: 12 }}>
          <span style={{ fontWeight: 700, fontFamily: 'DM Mono, monospace', width: 48, flexShrink: 0 }}>{q.symbol}</span>
          <span style={{ flex: 1, color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{fmt(q.price)}</span>
          <span style={{ color: deltaColor(q.deltaP), fontSize: 11, width: 54, textAlign: 'right', flexShrink: 0 }}>{fmtPct(q.deltaP)}</span>
        </div>
      ))}
    </div>
  )

  // 3x — list with mini sparklines, no detail
  if (heightUnits <= 3) return (
    <div style={{ padding: '4px 8px', height: '100%', overflowY: 'auto' }}>
      {data.quotes.map(q => (
        <QuoteRow key={q.symbol} q={q} sparks={data.sparks} selected={false} onClick={() => {}} />
      ))}
    </div>
  )

  // 4x+ — list on top, detail + chart below
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, maxHeight: '45%', overflowY: 'auto',
        borderBottom: '1px solid var(--border)', padding: '4px 8px' }}>
        {data.quotes.map(q => (
          <QuoteRow key={q.symbol} q={q} sparks={data.sparks} selected={selected === q.symbol}
            onClick={() => { setSelected(q.symbol); setRange('1M') }} />
        ))}
      </div>
      {selectedQuote && (
        <div style={{ flex: 1, padding: '10px 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <QuoteDetail q={selectedQuote} sparks={sparksToUse} range={range} onRangeChange={handleRangeChange} />
          {loadingSpark && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loading chart...</div>}
        </div>
      )}
    </div>
  )
}
