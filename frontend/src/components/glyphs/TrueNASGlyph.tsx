import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

function pctColor(p: number) {
  return p >= 90 ? 'var(--red)' : p >= 75 ? 'var(--amber)' : 'var(--text-muted)'
}
function tempColor(c: number) {
  return c >= 85 ? 'var(--red)' : c >= 70 ? 'var(--amber)' : 'var(--text-muted)'
}

export default function TrueNASGlyph({ glyph }: { glyph: Glyph }) {
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
  const cpu = data.cpuPercent ?? 0
  const temp = data.cpuTempC ?? 0
  const alerts = data.alerts ?? 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
      fontFamily: 'DM Mono, monospace' }}>
      {alerts > 0 && <span style={{ color: 'var(--amber)' }}>⚠{alerts}</span>}
      <span style={{ color: 'var(--text-dim)' }}>TN</span>
      <span style={{ color: pctColor(cpu), fontWeight: 600 }}>{cpu.toFixed(0)}%</span>
      {temp > 0 && <span style={{ color: tempColor(temp) }}>{temp.toFixed(0)}°</span>}
    </div>
  )
}
