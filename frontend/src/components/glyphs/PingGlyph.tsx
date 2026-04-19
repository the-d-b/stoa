import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

export default function PingGlyph({ glyph }: { glyph: Glyph }) {
  const cfg = (() => { try { return JSON.parse(glyph.config) } catch { return {} } })()
  const [data, setData] = useState<any>(null)

  const load = useCallback(async () => {
    try { setData((await glyphsApi.getData(glyph.id)).data) } catch {}
  }, [glyph.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, (cfg.refreshSecs || 30) * 1000)
    return () => clearInterval(interval)
  }, [load, cfg.refreshSecs])

  if (!data) return null
  const up = data.up
  const ms = data.ms as number
  const label = cfg.label || new URL(data.host || 'http://host').hostname

  const color = !up ? 'var(--red)' : ms > 500 ? 'var(--amber)' : ms > 200 ? 'var(--text-muted)' : 'var(--green)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
      fontFamily: 'DM Mono, monospace' }}>
      <span style={{ color }}>{up ? '●' : '✕'}</span>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      {up && <span style={{ color, fontWeight: 600 }}>{ms}ms</span>}
    </div>
  )
}
