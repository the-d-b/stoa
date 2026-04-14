import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

interface KumaGlyphData {
  upCount: number; downCount: number; pauseCount: number; total: number
}

export default function KumaGlyph({ glyph }: { glyph: Glyph }) {
  const [data, setData] = useState<KumaGlyphData | null>(null)
  const [uiUrl, setUiUrl] = useState('')
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await glyphsApi.getData(glyph.id)
      setData(res.data)
      setUiUrl(res.data.uiUrl || '')
      setError(false)
    } catch { setError(true) }
  }, [glyph.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  if (error || !data) return null

  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
      fontFamily: 'DM Mono, monospace' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--green)' }}>●</span>
        <span style={{ fontWeight: 600 }}>{data.upCount} up</span>
      </span>
      <span style={{ color: 'var(--text-dim)' }}>/</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: data.downCount > 0 ? 'var(--red)' : 'var(--text-dim)' }}>●</span>
        <span style={{ fontWeight: 600, color: data.downCount > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
          {data.downCount} down
        </span>
      </span>
    </div>
  )

  if (uiUrl) {
    return (
      <a href={uiUrl} target="_blank" rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </a>
    )
  }
  return inner
}
