// Shared arc gauge component used by TrueNAS and Proxmox panels

interface ArcGaugeProps {
  value: number      // 0-100
  label: string      // text below value
  size?: number      // diameter in px, default 72
  title?: string     // small title above gauge
}

function getColor(pct: number) {
  if (pct >= 90) return 'var(--red)'
  if (pct >= 75) return 'var(--amber)'
  return 'var(--accent)'
}

export default function ArcGauge({ value, label, size = 72, title }: ArcGaugeProps) {
  const r = (size - 10) / 2
  const cx = size / 2
  const cy = size / 2
  // Arc goes from 210° to 330° (bottom-left to bottom-right, 240° sweep)
  const startAngle = 210
  const sweepAngle = 240
  const pct = Math.min(Math.max(value, 0), 100)
  const filled = (pct / 100) * sweepAngle

  function polarToXY(angleDeg: number, radius: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    }
  }

  function arcPath(startDeg: number, endDeg: number, radius: number) {
    const s = polarToXY(startDeg, radius)
    const e = polarToXY(endDeg, radius)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const trackPath = arcPath(startAngle, startAngle + sweepAngle, r)
  const fillPath = filled > 0 ? arcPath(startAngle, startAngle + filled, r) : null
  const color = getColor(pct)
  const strokeWidth = size < 60 ? 5 : 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      {title && (
        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {title}
        </div>
      )}
      <div style={{ position: 'relative', width: size, height: size * 0.8 }}>
        <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Track */}
          <path d={trackPath} fill="none" stroke="var(--surface2)" strokeWidth={strokeWidth}
            strokeLinecap="round" />
          {/* Fill */}
          {fillPath && (
            <path d={fillPath} fill="none" stroke={color} strokeWidth={strokeWidth}
              strokeLinecap="round" />
          )}
        </svg>
        {/* Center text */}
        <div style={{
          position: 'absolute', top: '38%', left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <span style={{ fontSize: size < 60 ? 13 : 16, fontWeight: 700,
            fontFamily: 'DM Mono, monospace', color }}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center',
        marginTop: -size * 0.15, fontFamily: 'DM Mono, monospace' }}>
        {label}
      </div>
    </div>
  )
}
