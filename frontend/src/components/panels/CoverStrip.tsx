/**
 * ScrollableCoverStrip — shared filmstrip component used by Sonarr, Radarr,
 * Lidarr and Readarr panels. Hover left/right 15% edge zones to auto-scroll.
 */
import { useRef, useState, useEffect, useCallback } from 'react'

interface CoverItem {
  coverUrl?: string
  title: string
  linkUrl?: string   // full URL to open on click
}

interface Props {
  items: CoverItem[]
  height?: number    // cover image height in px, default 72
}

export default function ScrollableCoverStrip({ items, height = 72 }: Props) {
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

  const width = Math.round(height * 0.67) // ~2:3 aspect ratio

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}>

      {/* Scroll zone indicators */}
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

      {/* Filmstrip */}
      <div ref={ref} style={{ display: 'flex', gap: 6, overflowX: 'auto',
        scrollbarWidth: 'none', maxWidth: '100%', minWidth: 0 }}>
        {covers.map((item, i) => (
          item.linkUrl
            ? <a key={i} href={item.linkUrl} target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0 }}>
                <img src={item.coverUrl} alt={item.title} width={width} height={height}
                  style={{ objectFit: 'cover', borderRadius: 5, display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </a>
            : <img key={i} src={item.coverUrl} alt={item.title} width={width} height={height}
                style={{ objectFit: 'cover', borderRadius: 5, display: 'block', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ))}
      </div>
    </div>
  )
}
