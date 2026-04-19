import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

function fmtMbs(mbs: number) {
  if (mbs >= 1000) return `${(mbs/1000).toFixed(1)}G`
  if (mbs >= 1) return `${mbs.toFixed(1)}M`
  if (mbs > 0) return `${(mbs*1000).toFixed(0)}K`
  return '0'
}

export default function OPNsenseGlyph({ glyph }: { glyph: Glyph }) {
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
  const down = data.gatewayDown
  const inMbs = data.totalInMbps ?? 0
  const outMbs = data.totalOutMbps ?? 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
      fontFamily: 'DM Mono, monospace' }}>
      <span style={{ color: down ? 'var(--red)' : 'var(--text-dim)' }}>
        {down ? '✕' : '●'}
      </span>
      <span style={{ color: 'var(--green)' }}>↓{fmtMbs(inMbs)}</span>
      <span style={{ color: 'var(--amber)' }}>↑{fmtMbs(outMbs)}</span>
    </div>
  )
}
