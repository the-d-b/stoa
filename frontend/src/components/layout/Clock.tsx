import { useEffect, useState } from 'react'

export default function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 15, fontWeight: 400, color: 'var(--text)', letterSpacing: '0.03em' }}>
        {time}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{date}</div>
    </div>
  )
}
