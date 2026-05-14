import { useState } from 'react'

export default function BackupPanel() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    setError('')
    setDone(false)
    try {
      const token = localStorage.getItem('stoa_token')
      const res = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Server error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stoa-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDone(true)
      setTimeout(() => setDone(false), 4000)
    } catch (e: any) {
      setError('Backup failed: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Create Backup
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Downloads a single <code>.tar.gz</code> archive containing the full database,
            all icons, uploaded avatars, and custom CSS sheets. Safe to run while the server is live.
          </div>
        </div>
        <div>
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading}
            style={{ minWidth: 150 }}
          >
            {downloading
              ? <><span className="spinner" style={{ marginRight: 6 }} />Preparing…</>
              : done ? '✓ Download started' : '↓ Download Backup'}
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '16px 22px',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Restore</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Restore is a CLI operation. Stop the server, then run:
        </div>
        <code style={{ display: 'block', fontSize: 12, background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px',
          color: 'var(--text)', fontFamily: 'DM Mono, monospace', whiteSpace: 'pre' }}>
          {`stoa-cli backup restore stoa-backup-YYYY-MM-DD.tar.gz`}
        </code>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          The server must be stopped before restoring so the database file is not locked.
          Restart the server after the restore completes.
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6,
          background: '#f8717112', border: '1px solid #f8717130', color: 'var(--red)' }}>
          {error}
        </div>
      )}

    </div>
  )
}
