import { useRef, useState, useEffect, useCallback } from 'react'

interface CoverItem {
  coverUrl?: string
  title: string
  linkUrl?: string
}

interface Props {
  items: CoverItem[]
  height?: number
}

function AuthCoverItem({ item, width, height }: { item: CoverItem; width: number; height: number }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!item.coverUrl) return
    let cancelled = false
    const token = localStorage.getItem('stoa_token')
    fetch(item.coverUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => { if (!r.ok) throw new Error(''); return r.blob() })
      .then(blob => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setObjectUrl(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [item.coverUrl])

  const img = objectUrl ? (
    <img src={objectUrl} alt={item.title} width={width} height={height}
      style={{ objectFit: 'cover', borderRadius: 5, display: 'block' }} />
  ) : (
    <div style={{ width, height, background: 'var(--surface2)', borderRadius: 5, flexShrink: 0 }} />
  )

  if (item.linkUrl) {
    return (
      <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
        {img}
      </a>
    )
  }
  return <div style={{ flexShrink: 0 }}>{img}</div>
}

export default function AuthCoverStrip({ items, height = 72 }: Props) {
  const covers = items.filter(i => i.coverUrl)
  const ref = useRef<HTMLDivElement>(null)
  const animRef = useRef<number | null>(null)
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null)

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = ref.current
    if (!el) return
    el.scrollLeft += dir === 'right' ? 3 : -3
  }, [])

  useEffect(() => {
    if (!hoverZone) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      animRef.current = null
      return
    }
    const loop = () => {
      scroll(hoverZone)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [hoverZone, scroll])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    if (x < w * 0.15) setHoverZone('left')
    else if (x > w * 0.85) setHoverZone('right')
    else setHoverZone(null)
  }

  if (covers.length === 0) return null

  const width = Math.round(height * 0.67)

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}>

      {hoverZone === 'left' && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '15%',
          background: 'linear-gradient(to right, var(--surface) 0%, transparent 100%)',
          zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          paddingLeft: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.7 }}>‹</span>
        </div>
      )}
      {hoverZone === 'right' && (
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '15%',
          background: 'linear-gradient(to left, var(--surface) 0%, transparent 100%)',
          zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingRight: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.7 }}>›</span>
        </div>
      )}

      <div ref={ref} style={{ display: 'flex', gap: 6, overflowX: 'auto',
        scrollbarWidth: 'none', maxWidth: '100%', minWidth: 0 }}>
        {covers.map((item, i) => (
          <AuthCoverItem key={i} item={item} width={width} height={height} />
        ))}
      </div>
    </div>
  )
}
