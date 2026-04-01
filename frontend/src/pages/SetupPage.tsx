import { useState } from 'react'
import { authApi, configApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'

interface Props { onComplete: () => void }
type Step = 'welcome' | 'admin' | 'app' | 'oauth' | 'tags' | 'groups' | 'done'

const PRESET_COLORS = ['#7c6fff','#a78bfa','#ec4899','#f87171','#fb923c','#fbbf24','#4ade80','#2dd4bf','#38bdf8','#64748b']

interface TagEntry { name: string; color: string }
interface GroupEntry { name: string; tagNames: string[]; isDefault: boolean }

export default function SetupPage({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [appUrl, setAppUrl] = useState(window.location.origin)
  const [tags, setTags] = useState<TagEntry[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0])
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [oauthIssuer, setOauthIssuer] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const steps: Step[] = ['welcome', 'admin', 'app', 'oauth', 'tags', 'groups', 'done']
  const stepIndex = steps.indexOf(step)

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
    setGroups(g => g.map(group => ({
      ...group,
      tagNames: group.tagNames.filter(tn => tn !== name)
    })))
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
    setError('')
    setLoading(true)
    try {
      const defaultGroup = groups.find(g => g.isDefault)
      await authApi.setupInit({
        adminUsername, adminPassword, appUrl,
        initialTags: tags,
        initialGroups: groups.map(g => ({ name: g.name, tagNames: g.tagNames })),
        defaultGroupName: defaultGroup?.name || '',
      })
      // Save OAuth config if provided
      if (oauthIssuer && oauthClientId) {
        try {
          await configApi.saveOAuth({
            issuerUrl: oauthIssuer,
            clientId: oauthClientId,
            clientSecret: oauthClientSecret,
            redirectUrl: appUrl + '/api/auth/oauth/callback',
          })
        } catch (e) {
          console.warn('OAuth config save failed - configure from admin panel:', e)
        }
      }
      const res = await authApi.login(adminUsername, adminPassword)
      login(res.data.token, res.data.user)
      setStep('done')
      setTimeout(onComplete, 1200)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Setup failed')
    } finally {
      setLoading(false)
    }
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

        {/* Step dots */}
        <div className="fade-up-1" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
          {(['welcome','admin','app','oauth','tags','groups'] as Step[]).map((s, i) => (
            <div key={s} style={{
              width: step === s ? 20 : 6, height: 6, borderRadius: 3,
              background: stepIndex > i ? 'var(--accent)' : step === s ? 'var(--accent)' : 'var(--surface2)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        <div className="card fade-up-2" style={{ padding: 28 }}>

          {/* Welcome */}
          {step === 'welcome' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 0 }}>Welcome to Stoa</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
                This wizard runs once to configure your dashboard. You'll set up your admin account,
                create tags and groups, and optionally configure a default group for new users.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('admin')}>
                Get started →
              </button>
            </div>
          )}

          {/* Admin account */}
          {step === 'admin' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Admin account</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Your permanent local fallback — works even when OAuth is misconfigured.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div><label className="label">Username</label>
                  <input className="input" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} placeholder="admin" autoFocus /></div>
                <div><label className="label">Password</label>
                  <input type="password" className="input" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="min 8 characters" /></div>
                <div><label className="label">Confirm password</label>
                  <input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="confirm password" /></div>
              </div>
              {error && <ErrorBox message={error} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setError(''); setStep('welcome') }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                  const e = validateAdmin(); if (e) { setError(e); return }
                  setError(''); setStep('app')
                }}>Next →</button>
              </div>
            </div>
          )}

          {/* App URL */}
          {step === 'app' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>App URL</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                The URL Stoa is reachable at. Used to build OAuth callback URLs.
              </p>
              <div style={{ marginBottom: 20 }}>
                <label className="label">App URL</label>
                <input className="input" value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="https://stoa.yourdomain.home" />
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

          {/* OAuth */}
          {step === 'oauth' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>OAuth / SSO <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>(optional)</span></h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Configure single sign-on. You can skip this and configure OAuth from the admin panel later.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div>
                  <label className="label">Issuer URL</label>
                  <input className="input" value={oauthIssuer} onChange={e => setOauthIssuer(e.target.value)}
                    placeholder="https://authentik.example.com/application/o/stoa/" />
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
                    callback → {appUrl}/api/auth/oauth/callback
                  </div>
                </div>
                <div>
                  <label className="label">Client ID</label>
                  <input className="input" value={oauthClientId} onChange={e => setOauthClientId(e.target.value)}
                    placeholder="your-client-id" />
                </div>
                <div>
                  <label className="label">Client Secret</label>
                  <input type="password" className="input" value={oauthClientSecret} onChange={e => setOauthClientSecret(e.target.value)}
                    placeholder="your-client-secret" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('app')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('tags')}>Next →</button>
              </div>
            </div>
          )}

          {/* Tags */}
          {step === 'tags' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Tags <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>(optional)</span></h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Tags control which panels users can see. You can skip this and add tags from the admin panel later.
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input className="input" value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  placeholder="Tag name" style={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && addTag()} />
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addTag}>Add</button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewTagColor(c)} style={{
                    width: 22, height: 22, borderRadius: 5, background: c, border: 'none',
                    cursor: 'pointer', outline: newTagColor === c ? '2px solid white' : 'none',
                    outlineOffset: 2, transform: newTagColor === c ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.15s',
                  }} />
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 32, marginBottom: 20 }}>
                {tags.map(t => (
                  <span key={t.name} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 8,
                    background: t.color + '18', border: `1px solid ${t.color}30`, color: t.color,
                    fontSize: 12, fontWeight: 500,
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
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('oauth')}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('groups')}>Next →</button>
              </div>
            </div>
          )}

          {/* Groups */}
          {step === 'groups' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Groups <span style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 400 }}>(optional)</span></h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Groups grant users access to tags. Set a default group to auto-enroll new OAuth users.
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input className="input" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Group name" style={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && addGroup()} />
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addGroup}>Add</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {groups.map(g => (
                  <div key={g.name} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--surface2)', border: g.isDefault ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setDefaultGroup(g.name)}
                          style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                            background: g.isDefault ? 'var(--accent-bg)' : 'var(--surface)',
                            color: g.isDefault ? 'var(--accent2)' : 'var(--text-muted)',
                          }}
                        >{g.isDefault ? '★ default' : '☆ set default'}</button>
                        <button onClick={() => removeGroup(g.name)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--red)', fontSize: 11, opacity: 0.6,
                        }}>✕</button>
                      </div>
                    </div>
                    {tags.length > 0 && (
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
                                color: has ? t.color : 'var(--text-dim)',
                                transition: 'all 0.15s',
                              }}>{t.name}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {tags.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Add tags in the previous step to assign them</div>}
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

          {/* Done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Setup complete</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Signing you in...</p>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', marginTop: 20 }}>
          OAuth can be configured after setup from the admin panel
        </p>
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
