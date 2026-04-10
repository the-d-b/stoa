import { useState } from 'react'
import { authApi, configApi, preferencesApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'

interface Props { onComplete: () => void }

type Step =
  | 'welcome'
  | 'mode'
  | 'admin'
  | 'auth_mode'
  | 'app'
  | 'oauth'
  | 'tags'
  | 'groups'
  | 'done'

const PRESET_COLORS = ['#7c6fff','#a78bfa','#ec4899','#f87171','#fb923c','#fbbf24','#4ade80','#2dd4bf','#38bdf8','#64748b']

interface TagEntry { name: string; color: string }
interface GroupEntry { name: string; tagNames: string[]; isDefault: boolean }

export default function SetupPage({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [userMode, setUserMode] = useState<'single' | 'multi'>('multi')
  const [autoLogin, setAutoLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [appUrl, setAppUrl] = useState(window.location.origin)
  const [oauthIssuer, setOauthIssuer] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [tags, setTags] = useState<TagEntry[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0])
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const multiSteps: Step[] = ['welcome','mode','admin','app','oauth','tags','groups']
  const singleSteps: Step[] = ['welcome','mode','admin','auth_mode']
  const stepsForMode = userMode === 'single' ? singleSteps : multiSteps
  const stepIndex = stepsForMode.indexOf(step)
  const totalDots = stepsForMode.length

  const validateAdmin = () => {
    if (!adminUsername) return 'Username is required'
    if (!adminPassword) return 'Password is required'
    if (adminPassword.length < 8) return 'Password must be at least 8 characters'
    if (adminPassword !== confirmPassword) return 'Passwords do not match'
    return ''
  }

  const addTag = () => {
    if (!newTagName.trim()) return
    setTags(t => [...t, { name: newTagName.trim(), color: newTagColor }])
    setNewTagName('')
    setNewTagColor(PRESET_COLORS[tags.length % PRESET_COLORS.length])
  }
  const removeTag = (name: string) => {
    setTags(t => t.filter(tag => tag.name !== name))
    setGroups(g => g.map(group => ({ ...group, tagNames: group.tagNames.filter(tn => tn !== name) })))
  }
  const addGroup = () => {
    if (!newGroupName.trim()) return
    setGroups(g => [...g, { name: newGroupName.trim(), tagNames: [], isDefault: false }])
    setNewGroupName('')
  }
  const removeGroup = (name: string) => setGroups(g => g.filter(gr => gr.name !== name))
  const toggleGroupTag = (groupName: string, tagName: string) => {
    setGroups(g => g.map(gr => {
      if (gr.name !== groupName) return gr
      const has = gr.tagNames.includes(tagName)
      return { ...gr, tagNames: has ? gr.tagNames.filter(t => t !== tagName) : [...gr.tagNames, tagName] }
    }))
  }
  const setDefaultGroup = (name: string) => {
    setGroups(g => g.map(gr => ({ ...gr, isDefault: gr.name === name ? !gr.isDefault : false })))
  }

  const handleFinish = async () => {
    setError(''); setLoading(true)
    try {
      const defaultGroup = groups.find(g => g.isDefault)
      await authApi.setupInit({
        adminUsername, adminPassword,
        appUrl: userMode === 'single' ? window.location.origin : appUrl,
        userMode, autoLogin: userMode === 'single' && autoLogin,
        initialTags: tags,
        initialGroups: groups.map(g => ({ name: g.name, tagNames: g.tagNames })),
        defaultGroupName: defaultGroup?.name || '',
      })
      if (userMode === 'multi' && oauthIssuer && oauthClientId) {
        try {
          await configApi.saveOAuth({
            issuerUrl: oauthIssuer, clientId: oauthClientId,
            clientSecret: oauthClientSecret,
            redirectUrl: appUrl + '/api/auth/oauth/callback',
          })
        } catch (e) { console.warn('OAuth config save failed:', e) }
      }
      if (userMode === 'single' && autoLogin) {
        const r = await authApi.autoLogin()
        login(r.data.token, r.data.user)
      } else {
        const res = await authApi.login(adminUsername, adminPassword)
        login(res.data.token, res.data.user)
      }
      // Save current theme so it persists on next load
      const currentTheme = localStorage.getItem('stoa_theme')
      if (currentTheme) {
        try { await preferencesApi.save({ theme: currentTheme }) } catch {}
      }
      setStep('done')
      setTimeout(onComplete, 1200)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Setup failed')
    } finally { setLoading(false) }
  }

  const ModeOption = ({ value, label, desc }: { value: 'single'|'multi'|boolean; label: string; desc: string }) => {
    const selected = typeof value === 'boolean' ? autoLogin === value : userMode === value
    const click = () => { if (typeof value === 'boolean') setAutoLogin(value); else setUserMode(value) }
    return (
      <div onClick={click} style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderRadius: 10,
        cursor: 'pointer', transition: 'all 0.15s',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent-bg)' : 'var(--surface)',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          border: `2px solid ${selected ? 'var(--accent2)' : 'var(--border2)'}`,
          background: selected ? 'var(--accent2)' : 'transparent', transition: 'all 0.15s',
        }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      backgroundImage: 'radial-gradient(ellipse 60% 40% at 50% 0%, var(--accent-bg), transparent)',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <StoaLogo size={32} />
            <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>stoa</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>first-run setup</div>
        </div>

        {step !== 'done' && (
          <div className="fade-up-1" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
            {Array.from({ length: totalDots }).map((_, i) => (
              <div key={i} style={{
                width: stepIndex === i ? 20 : 6, height: 6, borderRadius: 3,
                background: stepIndex > i ? 'var(--accent)' : stepIndex === i ? 'var(--accent)' : 'var(--surface2)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
        )}

        <div className="card fade-up-2" style={{ padding: 28 }}>

          {step === 'welcome' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 0 }}>Welcome to Stoa</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
                This wizard runs once to configure your dashboard. You'll choose your deployment mode,
                create an admin account, and optionally configure authentication and access control.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('mode')}>
                Get started →
              </button>
            </div>
          )}

          {step === 'mode' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Deployment mode</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Choose how Stoa will be used. This affects which features are shown.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <ModeOption value="single" label="Single user"
                  desc="Just you. No group management or shared content sections. Optionally disable the login screen." />
                <ModeOption value="multi" label="Multi user"
                  desc="Multiple users with OAuth and/or local accounts. Full admin controls, groups, shared panels and integrations." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('welcome')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('admin')}>Next →</button>
              </div>
            </div>
          )}

          {step === 'admin' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Admin account</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                {userMode === 'single'
                  ? 'Your account for accessing Stoa.'
                  : 'Your permanent local fallback — works even when OAuth is misconfigured.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div><label className="label">Username</label>
                  <input className="input" value={adminUsername} onChange={e => setAdminUsername(e.target.value)}
                    placeholder="admin" autoFocus /></div>
                <div><label className="label">Password</label>
                  <input type="password" className="input" value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)} placeholder="min 8 characters" /></div>
                <div><label className="label">Confirm password</label>
                  <input type="password" className="input" value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} placeholder="confirm password" /></div>
              </div>
              {error && <ErrorBox message={error} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setError(''); setStep('mode') }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                  const e = validateAdmin(); if (e) { setError(e); return }
                  setError(''); setStep(userMode === 'single' ? 'auth_mode' : 'app')
                }}>Next →</button>
              </div>
            </div>
          )}

          {step === 'auth_mode' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Login requirement</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Since this is a single-user setup, you can require a login every session or have Stoa sign you in automatically.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <ModeOption value={false} label="Require login"
                  desc="Show a login screen each session. Recommended if your dashboard is accessible from the internet or shared devices." />
                <ModeOption value={true} label="Auto-login — no password prompt"
                  desc="Stoa signs you in automatically on every visit. Best for a private home network where you trust all local access." />
              </div>
              {error && <ErrorBox message={error} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setError(''); setStep('admin') }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('tags')}>
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'app' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>App URL</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                The URL Stoa is reachable at. Used to build OAuth callback URLs.
              </p>
              <div style={{ marginBottom: 20 }}>
                <label className="label">App URL</label>
                <input className="input" value={appUrl} onChange={e => setAppUrl(e.target.value)}
                  placeholder="https://stoa.yourdomain.home" />
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5, fontFamily: 'DM Mono, monospace' }}>
                  callback → {appUrl}/api/auth/oauth/callback
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('admin')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('oauth')}>Next →</button>
              </div>
            </div>
          )}

          {step === 'oauth' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>
                OAuth / SSO <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>(optional)</span>
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Configure single sign-on. You can skip this and configure OAuth from the admin panel later.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div><label className="label">Issuer URL</label>
                  <input className="input" value={oauthIssuer} onChange={e => setOauthIssuer(e.target.value)}
                    placeholder="https://authentik.example.com/application/o/stoa/" />
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
                    callback → {appUrl}/api/auth/oauth/callback
                  </div>
                </div>
                <div><label className="label">Client ID</label>
                  <input className="input" value={oauthClientId} onChange={e => setOauthClientId(e.target.value)}
                    placeholder="your-client-id" /></div>
                <div><label className="label">Client Secret</label>
                  <input type="password" className="input" value={oauthClientSecret}
                    onChange={e => setOauthClientSecret(e.target.value)} placeholder="your-client-secret" /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('app')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('tags')}>
                  {oauthIssuer && oauthClientId ? 'Next →' : 'Skip →'}
                </button>
              </div>
            </div>
          )}

          {step === 'tags' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>
                Tags <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>(optional)</span>
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Tags control which panels users can see. You can skip this and add tags from the admin panel later.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input className="input" value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  placeholder="Tag name" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && addTag()} />
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addTag}>Add</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewTagColor(c)} style={{
                    width: 22, height: 22, borderRadius: 5, background: c, border: 'none', cursor: 'pointer',
                    outline: newTagColor === c ? '2px solid white' : 'none', outlineOffset: 2,
                    transform: newTagColor === c ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.15s',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 32, marginBottom: 20 }}>
                {tags.map(t => (
                  <span key={t.name} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
                    borderRadius: 8, background: t.color + '18', border: `1px solid ${t.color}30`,
                    color: t.color, fontSize: 12, fontWeight: 500,
                  }}>
                    {t.name}
                    <button onClick={() => removeTag(t.name)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'inherit', opacity: 0.5, padding: 0, fontSize: 11,
                    }}>✕</button>
                  </span>
                ))}
                {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No tags added yet</span>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }}
                  onClick={() => setStep(userMode === 'single' ? 'auth_mode' : 'oauth')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  onClick={() => userMode === 'single' ? handleFinish() : setStep('groups')}>
                  {userMode === 'single' ? (loading ? <span className="spinner" /> : 'Finish setup') : 'Next →'}
                </button>
              </div>
            </div>
          )}

          {step === 'groups' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>
                Groups <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>(optional)</span>
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Groups grant users access to tags. Set a default group to auto-enroll new OAuth users.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input className="input" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Group name" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && addGroup()} />
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addGroup}>Add</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {groups.map(g => (
                  <div key={g.name} style={{
                    padding: '10px 12px', borderRadius: 8, background: 'var(--surface2)',
                    border: g.isDefault ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setDefaultGroup(g.name)} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                          background: g.isDefault ? 'var(--accent-bg)' : 'var(--surface)',
                          color: g.isDefault ? 'var(--accent2)' : 'var(--text-muted)',
                        }}>{g.isDefault ? '★ default' : '☆ set default'}</button>
                        <button onClick={() => removeGroup(g.name)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--red)', fontSize: 11, opacity: 0.6,
                        }}>✕</button>
                      </div>
                    </div>
                    {tags.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Tag access:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {tags.map(t => {
                            const has = g.tagNames.includes(t.name)
                            return (
                              <button key={t.name} onClick={() => toggleGroupTag(g.name, t.name)} style={{
                                padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                                background: has ? t.color + '18' : 'transparent',
                                border: `1px solid ${has ? t.color + '50' : 'var(--border)'}`,
                                color: has ? t.color : 'var(--text-dim)', transition: 'all 0.15s',
                              }}>{t.name}</button>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Add tags in the previous step to assign them</div>
                    )}
                  </div>
                ))}
                {groups.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No groups added yet</div>}
              </div>
              {error && <ErrorBox message={error} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('tags')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleFinish} disabled={loading}>
                  {loading ? <span className="spinner" /> : 'Finish setup'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Setup complete</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                {autoLogin ? 'Signing you in automatically...' : 'Signing you in...'}
              </p>
            </div>
          )}
        </div>

        {step !== 'done' && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', marginTop: 20 }}>
            {userMode === 'multi'
              ? 'OAuth can be configured after setup from the admin panel'
              : 'Mode and auth settings can be adjusted via SQL after setup'}
          </p>
        )}
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: '#f8717110', border: '1px solid #f8717130', color: 'var(--red)',
      borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16,
    }}>{message}</div>
  )
}
