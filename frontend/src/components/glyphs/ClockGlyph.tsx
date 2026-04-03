import { useEffect, useState } from 'react'
import { Glyph } from '../../api'

interface ClockConfig {
  format: '12h' | '24h'
  showSeconds: boolean
  showDate: boolean
  timezone: string   // IANA timezone e.g. 'America/New_York', '' = local
  label: string      // optional label e.g. 'NYC', 'London'
}

export default function ClockGlyph({ glyph }: { glyph: Glyph }) {
  const [now, setNow] = useState(new Date())
  const config: ClockConfig = (() => {
    try { return { format: '12h', showSeconds: false, showDate: true, timezone: '', label: '', ...JSON.parse(glyph.config) } }
    catch { return { format: '12h', showSeconds: false, showDate: true, timezone: '', label: '' } }
  })()

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const tzOpts = config.timezone ? { timeZone: config.timezone } : {}

  const timeStr = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: config.showSeconds ? '2-digit' : undefined,
    hour12: config.format === '12h',
    ...tzOpts,
  })

  const dateStr = now.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    ...tzOpts,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}
      title={config.timezone || 'Local time'}>
      {config.label && (
        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>
          {config.label}
        </span>
      )}
      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', color: 'var(--text)' }}>
        {timeStr}
      </span>
      {config.showDate && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{dateStr}</span>
      )}
    </div>
  )
}
