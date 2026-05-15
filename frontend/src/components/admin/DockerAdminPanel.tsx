import { useState, useEffect } from 'react'
import { dockerApi, DockerHostRow, DockerConfig, groupsApi } from '../../api'

export default function DockerAdminPanel() {
  const [config, setConfig] = useState<DockerConfig | null>(null)
  const [allGroups, setAllGroups] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  const [newHost, setNewHost] = useState({ name: '', type: 'local', url: '' })
  const [addingHost, setAddingHost] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.all([dockerApi.getConfig(), groupsApi.list()])
      .then(([cfg, grps]) => {
        setConfig(cfg.data)
        setAllGroups(grps.data.map((g: any) => ({ id: g.id, name: g.name })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!config) return
    setSaving(true)
    try {
      await dockerApi.saveConfig({ enabled: config.enabled, groupIds: config.groupIds })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const toggleGroup = (gid: string) => {
    if (!config) return
    const ids = config.groupIds.includes(gid)
      ? config.groupIds.filter(id => id !== gid)
      : [...config.groupIds, gid]
    setConfig({ ...config, groupIds: ids })
  }

  const addHost = async () => {
    if (!newHost.name.trim()) return
    if (newHost.type === 'remote' && !newHost.url.trim()) return
    setAddingHost(true)
    try {
      const res = await dockerApi.createHost(newHost)
      setConfig(c => c ? { ...c, hosts: [...c.hosts, res.data] } : c)
      setNewHost({ name: '', type: 'local', url: '' })
    } catch { /* ignore */ } finally { setAddingHost(false) }
  }

  const deleteHost = async (id: string) => {
    await dockerApi.deleteHost(id)
    setConfig(c => c ? { ...c, hosts: c.hosts.filter(h => h.id !== id) } : c)
    setTestResults(r => { const n = { ...r }; delete n[id]; return n })
  }

  const testHost = async (host: DockerHostRow) => {
    setTesting(t => ({ ...t, [host.id]: true }))
    try {
      const res = await dockerApi.testHost({ id: host.id })
      setTestResults(r => ({
        ...r,
        [host.id]: res.data.ok
          ? { ok: true, msg: `Connected — Docker ${res.data.version}` }
          : { ok: false, msg: res.data.error || 'Failed' },
      }))
    } catch (e: any) {
      setTestResults(r => ({ ...r, [host.id]: { ok: false, msg: e.message } }))
    } finally {
      setTesting(t => ({ ...t, [host.id]: false }))
    }
  }

  const testNewHost = async () => {
    const key = '__new__'
    setTesting(t => ({ ...t, [key]: true }))
    try {
      const res = await dockerApi.testHost({ type: newHost.type, url: newHost.url })
      setTestResults(r => ({
        ...r,
        [key]: res.data.ok
          ? { ok: true, msg: `Connected — Docker ${res.data.version}` }
          : { ok: false, msg: res.data.error || 'Failed' },
      }))
    } catch (e: any) {
      setTestResults(r => ({ ...r, [key]: { ok: false, msg: e.message } }))
    } finally {
      setTesting(t => ({ ...t, [key]: false }))
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
  if (!config) return <div style={{ color: 'var(--red)', fontSize: 13 }}>Failed to load config.</div>

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Info callout */}
      <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)', borderRadius: 10,
        padding: '14px 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, color: 'var(--accent2)', marginBottom: 6 }}>Setup</div>
        <div style={{ marginBottom: 8 }}>
          For <strong>local</strong> Docker: mount the socket into your Stoa container:
        </div>
        <code style={{ display: 'block', background: 'var(--surface2)', borderRadius: 6,
          padding: '6px 10px', fontFamily: 'DM Mono, monospace', fontSize: 12, marginBottom: 10,
          whiteSpace: 'pre' }}>{`volumes:\n  - /var/run/docker.sock:/var/run/docker.sock`}</code>
        <div>
          For <strong>remote</strong> hosts: run <code>tecnativa/docker-socket-proxy</code> on
          each host and point Stoa at its HTTP URL (e.g. <code>http://192.168.1.20:2375</code>).
        </div>
      </div>

      {/* Enable toggle */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Docker</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Show the Docker control panel to permitted users
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.enabled}
              onChange={e => setConfig({ ...config, enabled: e.target.checked })} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Group access */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>
            Access — groups that can see Docker
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.5 }}>
            Admins always have access. Select groups for non-admin users.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allGroups.map(g => {
              const selected = config.groupIds.includes(g.id)
              return (
                <button key={g.id} onClick={() => toggleGroup(g.id)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-bg)' : 'var(--surface2)',
                  color: selected ? 'var(--accent2)' : 'var(--text-muted)',
                  fontWeight: selected ? 600 : 400, transition: 'all 0.12s',
                }}>
                  {g.name}
                </button>
              )
            })}
            {allGroups.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No groups defined yet.</span>
            )}
          </div>
        </div>

        <div>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 100 }}>
            {saving ? 'Saving…' : saveOk ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Docker hosts */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Docker Hosts</div>

        {/* Existing hosts */}
        {config.hosts.map(h => {
          const res = testResults[h.id]
          return (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, background: 'var(--surface2)',
              border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{h.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                  {h.type === 'local' ? 'local socket' : h.url}
                </div>
              </div>
              {res && (
                <div style={{ fontSize: 11, color: res.ok ? 'var(--green)' : 'var(--red)' }}>
                  {res.ok ? '✓' : '✗'} {res.msg}
                </div>
              )}
              <button className="btn btn-sm" onClick={() => testHost(h)}
                disabled={testing[h.id]} style={{ fontSize: 12, padding: '4px 10px' }}>
                {testing[h.id] ? '…' : 'Test'}
              </button>
              <button onClick={() => deleteHost(h.id)} style={{
                background: 'none', border: 'none', color: 'var(--text-dim)',
                cursor: 'pointer', fontSize: 15, padding: '2px 6px', lineHeight: 1,
              }} title="Remove">×</button>
            </div>
          )
        })}

        {/* Add host form */}
        <div style={{ borderTop: config.hosts.length > 0 ? '1px solid var(--border)' : 'none',
          paddingTop: config.hosts.length > 0 ? 14 : 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Add Host</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input
              placeholder="Name (e.g. Home Server)"
              value={newHost.name}
              onChange={e => setNewHost(h => ({ ...h, name: e.target.value }))}
              style={{ flex: '1 1 140px', minWidth: 120 }}
              className="input"
            />
            <select value={newHost.type}
              onChange={e => setNewHost(h => ({ ...h, type: e.target.value, url: '' }))}
              className="input" style={{ flex: '0 0 auto' }}>
              <option value="local">Local (socket)</option>
              <option value="remote">Remote (HTTP)</option>
            </select>
            {newHost.type === 'remote' && (
              <input
                placeholder="http://192.168.1.20:2375"
                value={newHost.url}
                onChange={e => setNewHost(h => ({ ...h, url: e.target.value }))}
                className="input"
                style={{ flex: '1 1 200px', minWidth: 160 }}
              />
            )}
          </div>
          {testResults['__new__'] && (
            <div style={{ fontSize: 11, color: testResults['__new__'].ok ? 'var(--green)' : 'var(--red)' }}>
              {testResults['__new__'].ok ? '✓' : '✗'} {testResults['__new__'].msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={testNewHost}
              disabled={testing['__new__'] || (!newHost.url && newHost.type === 'remote')}
              style={{ fontSize: 12 }}>
              {testing['__new__'] ? '…' : 'Test'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={addHost}
              disabled={addingHost || !newHost.name.trim() || (newHost.type === 'remote' && !newHost.url.trim())}
              style={{ fontSize: 12 }}>
              {addingHost ? 'Adding…' : '+ Add'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
