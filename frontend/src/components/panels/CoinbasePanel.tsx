import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface CoinbaseAccount {
  name: string
  currency: string
  currencyName: string
  balance: number
  nativeBalance: number
  allocation: number
}

interface CoinbasePanelData {
  uiUrl: string
  integrationId: string
  totalUsd: number
  accountCount: number
  accounts: CoinbaseAccount[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtCrypto(n: number, code: string): string {
  if (n === 0) return `0 ${code}`
  // For large quantities, show 2dp; for tiny crypto, show up to 8dp
  const decimals = n >= 1 ? 4 : 8
  return `${n.toFixed(decimals).replace(/\.?0+$/, '')} ${code}`
}

// Well-known crypto brand colors; fallback to indigo
const CRYPTO_COLORS: Record<string, string> = {
  BTC:  '#F7931A',
  ETH:  '#627EEA',
  SOL:  '#9945FF',
  ADA:  '#0033AD',
  DOT:  '#E6007A',
  AVAX: '#E84142',
  MATIC:'#8247E5',
  LINK: '#2A5ADA',
  UNI:  '#FF007A',
  LTC:  '#BFBBBB',
  BCH:  '#8DC351',
  XRP:  '#346AA9',
  XLM:  '#14B6E7',
  ATOM: '#2E3148',
  DOGE: '#C2A633',
  SHIB: '#FFA409',
  USD:  '#26A17B',
  USDC: '#2775CA',
  USDT: '#26A17B',
  DAI:  '#F4B731',
  EUR:  '#0070C0',
  GBP:  '#00B5E2',
}

function cryptoColor(code: string, index: number): string {
  const FALLBACKS = ['#6366f1','#22c55e','#f59e0b','#06b6d4','#a855f7','#f97316','#14b8a6','#ec4899']
  return CRYPTO_COLORS[code] ?? FALLBACKS[index % FALLBACKS.length]
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AllocationDonut({ accounts, total }: { accounts: CoinbaseAccount[]; total: number }) {
  const top = accounts.slice(0, 9)
  const otherVal = accounts.slice(9).reduce((s, a) => s + a.nativeBalance, 0)
  const segments = otherVal > 0
    ? [...top, { currency: 'OTHER', currencyName: 'Other', nativeBalance: otherVal, allocation: otherVal / total, name: 'Other', balance: 0 }]
    : top

  const cx = 56, cy = 56, r = 44, sw = 16, circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={112} height={112} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#222" strokeWidth={sw} />
        {segments.map((s, i) => {
          const arc = s.allocation * circ
          const color = s.currency === 'OTHER' ? '#444' : cryptoColor(s.currency, i)
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeDasharray={`${arc} ${circ}`}
              strokeDashoffset={circ - offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt" />
          )
          offset += arc
          return seg
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={10} fill="#888">Total</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#e0e0e0">
          {fmtUSD(total)}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {segments.map((s, i) => {
          const color = s.currency === 'OTHER' ? '#444' : cryptoColor(s.currency, i)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.currency === 'OTHER' ? 'Other' : s.currency}
              </span>
              <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>{(s.allocation * 100).toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AccountRow({ account, index, showBar }: { account: CoinbaseAccount; index: number; showBar?: boolean }) {
  const color = cryptoColor(account.currency, index)
  const isFiat = ['USD','USDC','USDT','DAI','EUR','GBP'].includes(account.currency)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #1a1a1a' }}>
      {/* Currency color swatch */}
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
      {/* Name + quantity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#e0e0e0', fontWeight: 500 }}>{account.currency}</div>
        {!isFiat && account.balance > 0 && (
          <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>{fmtCrypto(account.balance, account.currency)}</div>
        )}
      </div>
      {/* Allocation bar */}
      {showBar && (
        <div style={{ width: 60, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ width: `${account.allocation * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
      )}
      {/* USD value */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#ddd' }}>{fmtUSD(account.nativeBalance)}</div>
      </div>
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function CoinbasePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<CoinbasePanelData | null>(null)
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

  if (!integrationId) return <div style={{ padding: 16, color: '#666', fontSize: 13 }}>No integration configured.</div>
  if (loading) return <div style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading...</div>
  if (error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>
  if (!data) return null

  const accounts = data.accounts || []

  // ── 1x ────────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 20, height: '100%', overflow: 'hidden' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e0e0e0', lineHeight: 1 }}>{fmtUSD(data.totalUsd)}</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coinbase · {data.accountCount} assets</div>
        </div>
        {/* Top 3 currencies as color pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {accounts.slice(0, 4).map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1a1a1a', borderRadius: 6, padding: '3px 8px' }}>
              <div style={{ width: 7, height: 7, borderRadius: 1, background: cryptoColor(a.currency, i) }} />
              <span style={{ fontSize: 11, color: '#ccc' }}>{a.currency}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── 2-3x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
        {/* Total + stacked allocation bar */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#e0e0e0', lineHeight: 1 }}>{fmtUSD(data.totalUsd)}</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coinbase Portfolio</div>
          {/* Stacked allocation bar */}
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
            {accounts.slice(0, 8).map((a, i) => (
              <div key={i} style={{ flex: a.allocation, background: cryptoColor(a.currency, i), minWidth: 2 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
            {accounts.slice(0, 6).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: 1, background: cryptoColor(a.currency, i) }} />
                <span style={{ fontSize: 11, color: '#aaa' }}>{a.currency}</span>
                <span style={{ fontSize: 11, color: '#555' }}>{(a.allocation * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
        {/* Account list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {accounts.map((a, i) => <AccountRow key={i} account={a} index={i} />)}
        </div>
      </div>
    )
  }

  // ── 4x+ ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left col — total + donut */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #1e1e1e', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#e0e0e0', lineHeight: 1.1 }}>{fmtUSD(data.totalUsd)}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coinbase · {data.accountCount} assets</div>
        </div>
        {accounts.length > 0 && (
          <AllocationDonut accounts={accounts} total={data.totalUsd} />
        )}
      </div>

      {/* Right col — full account list with bars */}
      <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto', minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Accounts</div>
        {accounts.map((a, i) => <AccountRow key={i} account={a} index={i} showBar />)}
      </div>
    </div>
  )
}
