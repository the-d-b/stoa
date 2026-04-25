import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'
import { useSSE } from '../../hooks/useSSE'

function pctColor(p: number) {
  return p >= 90 ? 'var(--red)' : p >= 75 ? 'var(--amber)' : 'var(--text-muted)'
}

export default function ProxmoxGlyph({ glyph }: { glyph: Glyph }) {
  const cfg = (() => { try { return JSON.parse(glyph.config) } catch { return {} } })()
  const [data, setData] = useState<any>(null)

  const sseUpdate = useSSE<any>(cfg.integrationId)

  const load = useCallback(async () => {
    try { setData((await glyphsApi.getData(glyph.id)).data) } catch {}
  }, [glyph.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, (cfg.refreshSecs || 30) * 1000)
    return () => clearInterval(interval)
  }, [load, cfg.refreshSecs])

  useEffect(() => {
    if (sseUpdate !== null) load()
  }, [sseUpdate, load])

  if (!data) return null
  const cpu = data.cpuPercent ?? 0
  const mem = data.memPercent ?? 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
      fontFamily: 'DM Mono, monospace' }}>
      <span style={{ color: 'var(--text-dim)' }}>PVE</span>
      <span style={{ color: pctColor(cpu), fontWeight: 600 }}>CPU {cpu.toFixed(0)}%</span>
      <span style={{ color: pctColor(mem) }}>MEM {mem.toFixed(0)}%</span>
    </div>
  )
}
