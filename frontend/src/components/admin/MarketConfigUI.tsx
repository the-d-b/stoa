import { useState } from 'react'

// Popular stocks for quick-add
const POPULAR_STOCKS = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','BRK-B',
  'JPM','V','UNH','XOM','JNJ','WMT','PG','MA','HD','BAC','ABBV','MRK'
]

// Popular crypto — CoinGecko IDs
const POPULAR_CRYPTO = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana', symbol: 'SOL' },
  { id: 'ripple', symbol: 'XRP' },
  { id: 'cardano', symbol: 'ADA' },
  { id: 'dogecoin', symbol: 'DOGE' },
  { id: 'polkadot', symbol: 'DOT' },
  { id: 'chainlink', symbol: 'LINK' },
  { id: 'avalanche-2', symbol: 'AVAX' },
  { id: 'uniswap', symbol: 'UNI' },
]

interface MarketCfg {
  stocks: string[]
  cryptos: string[]
}

function parseCfg(apiUrl: string): MarketCfg {
  try { return { stocks: [], cryptos: [], ...JSON.parse(apiUrl || '{}') } }
  catch { return { stocks: [], cryptos: [] } }
}

export default function MarketConfigUI({ apiUrl, onChange }: {
  apiUrl: string; onChange: (v: string) => void
}) {
  const [cfg, setCfg] = useState<MarketCfg>(() => parseCfg(apiUrl))
  const [stockInput, setStockInput] = useState('')

  const emit = (next: MarketCfg) => {
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const toggleStock = (sym: string) => {
    const s = sym.toUpperCase().trim()
    if (!s) return
    const next = cfg.stocks.includes(s)
      ? cfg.stocks.filter(x => x !== s)
      : [...cfg.stocks, s]
    emit({ ...cfg, stocks: next })
  }

  const addCustomStock = () => {
    const s = stockInput.toUpperCase().trim()
    if (!s || cfg.stocks.includes(s)) { setStockInput(''); return }
    emit({ ...cfg, stocks: [...cfg.stocks, s] })
    setStockInput('')
  }

  const toggleCrypto = (id: string) => {
    const next = cfg.cryptos.includes(id)
      ? cfg.cryptos.filter(x => x !== id)
      : [...cfg.cryptos, id]
    emit({ ...cfg, cryptos: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Stocks */}
      <div>
        <label className="label">Stocks <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(Yahoo Finance, no API key)</span></label>

        {/* Quick-add popular */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {POPULAR_STOCKS.map(s => {
            const on = cfg.stocks.includes(s)
            return (
              <button key={s} type="button" onClick={() => toggleStock(s)}
                style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
                {on ? '✓ ' : ''}{s}
              </button>
            )
          })}
        </div>

        {/* Custom symbol entry */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" value={stockInput}
            onChange={e => setStockInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addCustomStock()}
            placeholder="Add ticker (e.g. COST, TSM)" style={{ flex: 1, fontSize: 12 }} />
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addCustomStock}>
            Add
          </button>
        </div>

        {/* Custom stocks not in popular list */}
        {cfg.stocks.filter(s => !POPULAR_STOCKS.includes(s)).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {cfg.stocks.filter(s => !POPULAR_STOCKS.includes(s)).map(s => (
              <button key={s} type="button" onClick={() => toggleStock(s)}
                style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  background: 'var(--accent-bg)', border: '1px solid var(--accent)',
                  color: 'var(--accent2)', fontWeight: 600 }}>
                ✓ {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Crypto */}
      <div>
        <label className="label">Crypto <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(CoinGecko, no API key)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {POPULAR_CRYPTO.map(c => {
            const on = cfg.cryptos.includes(c.id)
            return (
              <button key={c.id} type="button" onClick={() => toggleCrypto(c.id)}
                style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
                {on ? '✓ ' : ''}{c.symbol}
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      {(cfg.stocks.length + cfg.cryptos.length) > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {cfg.stocks.length > 0 && <span>{cfg.stocks.length} stock{cfg.stocks.length !== 1 ? 's' : ''}: {cfg.stocks.join(', ')}</span>}
          {cfg.stocks.length > 0 && cfg.cryptos.length > 0 && <span> · </span>}
          {cfg.cryptos.length > 0 && <span>{cfg.cryptos.length} crypto: {POPULAR_CRYPTO.filter(c => cfg.cryptos.includes(c.id)).map(c => c.symbol).join(', ')}</span>}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        No API key required. Stocks refresh every 5min during market hours, crypto every 15min.
      </div>
    </div>
  )
}
