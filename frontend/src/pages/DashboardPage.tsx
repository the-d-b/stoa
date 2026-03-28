import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()

  return (
    <div className="fade-up" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '55vh', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 20, opacity: 0.12 }}>
        <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
          <rect x="2" y="24" width="28" height="3" rx="1.5" fill="var(--text)" />
          <rect x="4" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="10" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="19" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="25" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="2" y="5" width="28" height="3" rx="1.5" fill="var(--text)" />
        </svg>
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Welcome back, {user?.username}
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.7, margin: 0 }}>
        Your dashboard is empty — services and bookmarks are coming in v0.0.2.
        {isAdmin && (
          <> Head to <a href="/admin" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>settings</a> to configure OAuth and manage users.</>
        )}
      </p>

      <div style={{
        marginTop: 32, padding: '8px 16px', borderRadius: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
      }}>
        stoa v0.0.1 · identity foundation
      </div>
    </div>
  )
}
