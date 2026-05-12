import { useState } from 'react'

const POPULAR = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','BRK-B',
  'JPM','V','UNH','XOM','JNJ','WMT','PG','MA','HD','BAC','ABBV','MRK',
  'AMD','INTC','COST','DIS','NFLX','PYPL','CRM','ADBE','QCOM','TXN',
]

interface Cfg { symbols: string[] }

function parse(s: string): Cfg {
  try { return { symbols: [], ...JSON.parse(s || '{}') } }
  catch { return { symbols: [] } }
}

export default function StocksConfigUI({ apiUrl, onChange }: {
  apiUrl: string; onChange: (v: string) => void
}) {
  const [cfg, setCfg] = useState<Cfg>(() => parse(apiUrl))
  const [input, setInput] = useState('')

  const emit = (next: Cfg) => { setCfg(next); onChange(JSON.stringify(next)) }

  const toggle = (sym: string) => {
    const s = sym.toUpperCase().trim()
    if (!s) return
    emit({ ...cfg, symbols: cfg.symbols.includes(s)
      ? cfg.symbols.filter(x => x !== s)
      : [...cfg.symbols, s] })
  }

  const add = () => {
    const s = input.toUpperCase().trim()
    if (s && !cfg.symbols.includes(s)) emit({ ...cfg, symbols: [...cfg.symbols, s] })
    setInput('')
  }

  const custom = cfg.symbols.filter(s => !POPULAR.includes(s))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {POPULAR.map(s => {
          const on = cfg.symbols.includes(s)
          return (
            <button key={s} type="button" onClick={() => toggle(s)}
              style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
              {on ? '✓ ' : ''}{s}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add ticker (e.g. COST, TSM)" style={{ flex: 1, fontSize: 12 }} />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={add}>Add</button>
      </div>
      {custom.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {custom.map(s => (
            <button key={s} type="button" onClick={() => toggle(s)}
              style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: 'var(--accent-bg)', border: '1px solid var(--accent)',
                color: 'var(--accent2)', fontWeight: 600 }}>✓ {s}</button>
          ))}
        </div>
      )}
      {cfg.symbols.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {cfg.symbols.length} symbol{cfg.symbols.length !== 1 ? 's' : ''}: {cfg.symbols.join(', ')}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        Yahoo Finance — no API key required. Refreshes every 5 min during market hours.
      </div>
    </div>
  )
}
