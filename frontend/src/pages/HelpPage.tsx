import { Link } from 'react-router-dom'
import { useUserMode } from '../context/UserModeContext'
import { useAuth } from '../context/AuthContext'

const GITHUB = 'https://github.com/the-d-b/stoa'
const DOCS   = `${GITHUB}/tree/main/docs`

const VERSION = '0.4.0'

function DocLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '12px 16px', borderRadius: 10,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s',
    }}
    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</span>
    </a>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase',
        letterSpacing: '0.07em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function QRow({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '8px 0',
      borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 220 }}>{q}</span>
      <span style={{ color: 'var(--text)' }}>{a}</span>
    </div>
  )
}

export default function HelpPage() {
  const userMode = useUserMode()
  const isMulti = userMode === 'multi'
  const { isAdmin } = useAuth()
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px 0' }}>Help</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Stoa v{VERSION}</div>
        </div>
        <a href={GITHUB} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            color: 'var(--text-muted)', textDecoration: 'none', padding: '6px 12px',
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)' }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          GitHub
        </a>
      </div>

      {/* Documentation links */}
      <Section title="Documentation">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <DocLink href={`${DOCS}/concepts.md`} title="Concepts"
            desc="Users, Groups, Tags, Panels, Porticos" />
          <DocLink href={`${DOCS}/integrations.md`} title="Integrations"
            desc="Setup guides for every supported service" />
          <DocLink href={`${DOCS}/layouts.md`} title="Layout modes"
            desc="Stylos, Seira, and Rema explained" />
          <DocLink href={`${DOCS}/oauth.md`} title="OAuth / SSO"
            desc="Authentik, Keycloak, and OIDC setup" />
          <DocLink href={`${DOCS}/cli.md`} title="CLI reference"
            desc="stoa-cli commands for administration" />
          <DocLink href={`${GITHUB}/issues/new`} title="Report an issue"
            desc="Found a bug? Open a GitHub issue" />
        </div>
      </Section>

      {/* Quick reference */}
      <Section title="Quick reference">
        <QRow q="Layout mode: Stylos" a="Panels fill top→bottom by column. Configure column count and column height." />
        <QRow q="Layout mode: Seira" a="Panels flow left→right in rows. Configure column count." />
        <QRow q="Layout mode: Rema" a="Left→right rows that collapse when panels collapse. Configure column count." />
        <QRow q="OPNsense secret format" a={<code style={{ fontSize: 11, background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>apikey:apisecret</code>} />
        <QRow q="Proxmox secret format" a={<code style={{ fontSize: 11, background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>user@realm!tokenid:secret</code>} />
        <QRow q="Transmission secret format" a={<code style={{ fontSize: 11, background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>username:password</code>} />
        <QRow q="Sonarr / Radarr / Lidarr" a="Plain API key from Settings → General → API Key." />
        <QRow q="Plex secret" a="X-Plex-Token — found in any media item XML view URL." />
        <QRow q="Tautulli secret" a="Plain API key from Settings → Web Interface → API Key." />
        <QRow q="Tags vs Groups" a="Groups control access (who sees what). Tags control filtering (what's visible now)." />
        <QRow q="Personal panels" a="Visible only to you. Created in Profile → My Panels." />
        <QRow q="Porticos" a="Named dashboard views with independent tag filters and panel order." />
        <QRow q="Real-time panels" a="TrueNAS (WebSocket) and OPNsense (SSE streams) update live. Others poll every few minutes." />
      </Section>

      {/* Settings shortcuts */}
      <Section title="Shortcuts">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { label: 'My profile', to: '/profile', always: true },
            { label: 'My panels', to: '/profile?tab=mypanels', always: true },
            { label: 'My integrations', to: '/profile?tab=integrations', always: true },
            { label: 'Porticos', to: '/profile?tab=porticos', always: true },
            { label: 'Mail & Sessions', to: '/profile?tab=mail', always: true },
            { label: 'Admin → Panels', to: '/admin/panels', always: false },
            { label: 'Admin → Integrations', to: '/admin/integrations', always: false },
            { label: 'Admin → Tags', to: '/admin/tags', always: false },
            { label: 'Admin → Groups', to: '/admin/groups', always: false },
            { label: 'Admin → Users', to: '/admin/users', always: false },
            { label: 'Admin → OAuth', to: '/admin/oauth', always: false },
          ].filter(s => s.always || (isMulti && isAdmin)).map(({ label, to }) => (
            <Link key={to} to={to} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >{label}</Link>
          ))}
        </div>
      </Section>

    </div>
  )
}
