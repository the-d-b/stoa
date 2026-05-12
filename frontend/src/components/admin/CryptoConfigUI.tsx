import { useState } from 'react'

// CoinGecko IDs with display symbols
const POPULAR = [
  { id: 'bitcoin',        sym: 'BTC'  },
  { id: 'ethereum',       sym: 'ETH'  },
  { id: 'solana',         sym: 'SOL'  },
  { id: 'ripple',         sym: 'XRP'  },
  { id: 'cardano',        sym: 'ADA'  },
  { id: 'dogecoin',       sym: 'DOGE' },
  { id: 'shiba-inu',      sym: 'SHIB' },
  { id: 'polkadot',       sym: 'DOT'  },
  { id: 'chainlink',      sym: 'LINK' },
  { id: 'avalanche-2',    sym: 'AVAX' },
  { id: 'uniswap',        sym: 'UNI'  },
  { id: 'litecoin',       sym: 'LTC'  },
  { id: 'stellar',        sym: 'XLM'  },
  { id: 'monero',         sym: 'XMR'  },
  { id: 'cosmos',         sym: 'ATOM' },
  { id: 'toncoin',        sym: 'TON'  },
  { id: 'pepe',           sym: 'PEPE' },
  { id: 'sui',            sym: 'SUI'  },
]

interface Cfg { coins: string[] }

function parse(s: string): Cfg {
  try { return { coins: [], ...JSON.parse(s || '{}') } }
  catch { return { coins: [] } }
}

export default function CryptoConfigUI({ apiUrl, onChange }: {
  apiUrl: string; onChange: (v: string) => void
}) {
  const [cfg, setCfg] = useState<Cfg>(() => parse(apiUrl))
  const [input, setInput] = useState('')

  const emit = (next: Cfg) => { setCfg(next); onChange(JSON.stringify(next)) }

  const toggle = (id: string) => {
    emit({ ...cfg, coins: cfg.coins.includes(id)
      ? cfg.coins.filter(x => x !== id)
      : [...cfg.coins, id] })
  }

  const add = () => {
    const id = input.toLowerCase().trim().replace(/ /g, '-')
    if (id && !cfg.coins.includes(id)) emit({ ...cfg, coins: [...cfg.coins, id] })
    setInput('')
  }

  const customCoins = cfg.coins.filter(id => !POPULAR.find(p => p.id === id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {POPULAR.map(c => {
          const on = cfg.coins.includes(c.id)
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)}
              style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
              {on ? '✓ ' : ''}{c.sym}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="CoinGecko ID (e.g. shiba-inu, near, pepe)" style={{ flex: 1, fontSize: 12 }} />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={add}>Add</button>
      </div>
      {customCoins.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {customCoins.map(id => (
            <button key={id} type="button" onClick={() => toggle(id)}
              style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: 'var(--accent-bg)', border: '1px solid var(--accent)',
                color: 'var(--accent2)', fontWeight: 600 }}>✓ {id}</button>
          ))}
        </div>
      )}
      {cfg.coins.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {cfg.coins.length} coin{cfg.coins.length !== 1 ? 's' : ''}: {cfg.coins.map(id => POPULAR.find(p => p.id === id)?.sym || id).join(', ')}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        Uses CoinGecko IDs (not ticker symbols). Find the ID on coingecko.com — it's in the coin's URL, e.g. coingecko.com/en/coins/<strong>shiba-inu</strong>.
      </div>
    </div>
  )
}
