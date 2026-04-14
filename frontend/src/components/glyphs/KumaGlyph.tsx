import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

interface KumaGlyphData {
  upCount: number; downCount: number; pauseCount: number; total: number
}

export default function KumaGlyph({ glyph }: { glyph: Glyph }) {
  const [data, setData] = useState<KumaGlyphData | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await glyphsApi.getData(glyph.id)
      setData(res.data); setError(false)
    } catch {
      setError(true)
    }
  }, [glyph.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  if (error || !data) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
      fontFamily: 'DM Mono, monospace' }}>
      <span style={{ color: 'var(--green)' }}>●</span>
      <span style={{ fontWeight: 600 }}>{data.upCount}</span>
      {data.downCount > 0 && (
        <>
          <span style={{ color: 'var(--text-dim)', margin: '0 1px' }}>/</span>
          <span style={{ color: 'var(--red)' }}>●</span>
          <span style={{ fontWeight: 600, color: 'var(--red)' }}>{data.downCount}</span>
          <span style={{ color: 'var(--red)', fontSize: 10 }}>down</span>
        </>
      )}
      {data.downCount === 0 && (
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>up</span>
      )}
    </div>
  )
}
