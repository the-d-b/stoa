import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'

export default function ProfilePage() {
  const { user } = useAuth()

  const initials = user?.username
    ? user.username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className="fade-up" style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Profile
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 32px' }}>
        Your personal settings and preferences
      </p>

      {/* Avatar + name */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: 'var(--accent-bg)', border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 600, color: 'var(--accent2)', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{user?.username}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {user?.email || 'No email set'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
              {user?.role} · {user?.authProvider}
            </div>
          </div>
        </div>
      </div>

      {/* Coming soon sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { title: 'Theme', desc: 'Choose your color scheme — use the color wheel in the bottom corner for now' },
          { title: 'Email', desc: 'Update your email address' },
          { title: 'Profile picture', desc: 'Upload a custom avatar' },
          { title: 'Date & time format', desc: 'Customize how dates and times are displayed' },
          { title: 'Panel order', desc: 'Drag and drop to reorder your panels' },
        ].map(item => (
          <div key={item.title} style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>coming soon</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 12 }}>
        <StoaLogo size={14} />
        stoa v0.0.3
      </div>
    </div>
  )
}
