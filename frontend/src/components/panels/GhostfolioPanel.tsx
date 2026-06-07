import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface GhostfolioHolding {
  name: string
  symbol: string
  currency: string
  value: number
  allocationCurrent: number  // 0-1
  netPerformancePct: number  // 0-1
  netPerformance: number
  quantity: number
  marketPrice: number
}

interface GhostfolioPanelData {
  uiUrl: string
  integrationId: string
  currency: string
  currentValue: number
  totalInvestment: number
  todayChangePct: number
  todayChangeAmt: number
  yearChangePct: number
  allTimeChangePct: number
  allTimeChangeAmt: number
  holdings: GhostfolioHolding[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtPct(frac: number, showPlus = true): string {
  const pct = (frac * 100).toFixed(2)
  return showPlus && frac > 0 ? `+${pct}%` : `${pct}%`
}

function changeColor(frac: number): string {
  if (frac > 0) return '#22c55e'
  if (frac < 0) return '#ef4444'
  return '#888'
}

// Assign consistent colors to holdings by index
const HOLDING_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#06b6d4',
  '#a855f7', '#f97316', '#14b8a6', '#ec4899',
  '#84cc16', '#3b82f6',
]

// ── Holdings donut ─────────────────────────────────────────────────────────────

function HoldingsDonut({ holdings, value, currency }: { holdings: GhostfolioHolding[]; value: number; currency: string }) {
  const top = holdings.slice(0, 9)
  const otherValue = holdings.slice(9).reduce((s, h) => s + h.value, 0)
  const segments = otherValue > 0
    ? [...top, { name: 'Other', symbol: 'OTHER', value: otherValue, allocationCurrent: otherValue / value }]
    : top

  const cx = 56, cy = 56, r = 44, sw = 16, circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={112} height={112} style={{ flexShrink: 0 }}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#222" strokeWidth={sw} />
        {segments.map((s, i) => {
          const arc = s.allocationCurrent * circ
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={HOLDING_COLORS[i % HOLDING_COLORS.length]}
              strokeWidth={sw}
              strokeDasharray={`${arc} ${circ}`}
              strokeDashoffset={circ - offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt" />
          )
          offset += arc
          return seg
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={10} fill="#888">Net worth</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#e0e0e0">
          {fmtMoney(value, currency).replace(/\.00$/, '')}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: HOLDING_COLORS[i % HOLDING_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>{(s.allocationCurrent * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Holding row ────────────────────────────────────────────────────────────────

function HoldingRow({ h, color, currency }: { h: GhostfolioHolding; color: string; currency: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #1a1a1a' }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
        {h.quantity > 0 && h.marketPrice > 0 && (
          <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>
            {h.quantity.toPrecision(4)} × {fmtMoney(h.marketPrice, h.currency)}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#ddd' }}>{fmtMoney(h.value, currency)}</div>
        {h.netPerformancePct !== 0 && (
          <div style={{ fontSize: 10, color: changeColor(h.netPerformancePct) }}>
            {fmtPct(h.netPerformancePct)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Performance row ────────────────────────────────────────────────────────────

function PerfRow({ label, pct, amt, currency }: { label: string; pct: number; amt?: number; currency: string }) {
  const color = changeColor(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ fontSize: 12, color: '#777', width: 70, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{fmtPct(pct)}</span>
      {amt !== undefined && amt !== 0 && (
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>
          {amt > 0 ? '+' : ''}{fmtMoney(amt, currency)}
        </span>
      )}
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function GhostfolioPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<GhostfolioPanelData | null>(null)
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

  const holdings = data.holdings || []
  const cur = data.currency || 'USD'

  // ── 1x ────────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 20, height: '100%', overflow: 'hidden' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e0e0e0', lineHeight: 1 }}>
            {fmtMoney(data.currentValue, cur)}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net worth</div>
        </div>
        {data.todayChangePct !== 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: changeColor(data.todayChangePct) }}>
              {fmtPct(data.todayChangePct)}
            </span>
            <span style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Today</span>
          </div>
        )}
        {data.allTimeChangePct !== 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: changeColor(data.allTimeChangePct) }}>
              {fmtPct(data.allTimeChangePct)}
            </span>
            <span style={{ fontSize: 10, color: '#666', marginTop: 2 }}>All time</span>
          </div>
        )}
        {holdings.length > 0 && (
          <span style={{ fontSize: 11, color: '#555' }}>{holdings.length} holdings</span>
        )}
      </div>
    )
  }

  // ── 2-3x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
        {/* Value + changes */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#e0e0e0', lineHeight: 1 }}>
              {fmtMoney(data.currentValue, cur)}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net worth · {cur}</div>
          </div>
          <div style={{ display: 'flex', gap: 14, paddingBottom: 2 }}>
            {data.todayChangePct !== 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: changeColor(data.todayChangePct) }}>{fmtPct(data.todayChangePct)}</div>
                <div style={{ fontSize: 10, color: '#666' }}>Today</div>
              </div>
            )}
            {data.yearChangePct !== 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: changeColor(data.yearChangePct) }}>{fmtPct(data.yearChangePct)}</div>
                <div style={{ fontSize: 10, color: '#666' }}>1 Year</div>
              </div>
            )}
            {data.allTimeChangePct !== 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: changeColor(data.allTimeChangePct) }}>{fmtPct(data.allTimeChangePct)}</div>
                <div style={{ fontSize: 10, color: '#666' }}>All time</div>
              </div>
            )}
          </div>
        </div>

        {/* Holdings allocation bar */}
        {holdings.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
              {holdings.slice(0, 8).map((h, i) => (
                <div key={i} style={{
                  flex: h.allocationCurrent,
                  background: HOLDING_COLORS[i % HOLDING_COLORS.length],
                  minWidth: 2
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
              {holdings.slice(0, 6).map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 1, background: HOLDING_COLORS[i % HOLDING_COLORS.length] }} />
                  <span style={{ fontSize: 11, color: '#aaa' }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>{(h.allocationCurrent * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Holdings list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {holdings.slice(0, 8).map((h, i) => (
            <HoldingRow key={i} h={h} color={HOLDING_COLORS[i % HOLDING_COLORS.length]} currency={cur} />
          ))}
        </div>
      </div>
    )
  }

  // ── 4x+ ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left col — net worth + performance metrics */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #1e1e1e', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {/* Current value */}
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#e0e0e0', lineHeight: 1.1 }}>
            {fmtMoney(data.currentValue, cur)}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net worth · {cur}</div>
        </div>

        {/* Performance metrics */}
        <div>
          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Performance</div>
          {data.todayChangePct !== 0 && (
            <PerfRow label="Today" pct={data.todayChangePct} amt={data.todayChangeAmt} currency={cur} />
          )}
          {data.yearChangePct !== 0 && (
            <PerfRow label="1 Year" pct={data.yearChangePct} currency={cur} />
          )}
          {data.allTimeChangePct !== 0 && (
            <PerfRow label="All time" pct={data.allTimeChangePct} amt={data.allTimeChangeAmt} currency={cur} />
          )}
        </div>

        {/* Invested */}
        {data.totalInvestment > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Invested</div>
            <div style={{ fontSize: 16, color: '#aaa' }}>{fmtMoney(data.totalInvestment, cur)}</div>
          </div>
        )}
      </div>

      {/* Right col — donut + holdings list */}
      <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {holdings.length > 0 && (
          <>
            <HoldingsDonut holdings={holdings} value={data.currentValue} currency={cur} />
            <div>
              <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Holdings</div>
              {holdings.map((h, i) => (
                <HoldingRow key={i} h={h} color={HOLDING_COLORS[i % HOLDING_COLORS.length]} currency={cur} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
