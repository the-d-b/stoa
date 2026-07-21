/**
 * SecurityPosturePanel — for a curated set of network/storage-facing
 * integrations, shows the detected running version alongside known CVEs
 * for that product (from NVD). No source picker: every configured
 * integration in the covered list is included automatically. Deliberately
 * does not assert "you are affected" — shows the version and the CVE list
 * side by side and leaves the correlation to the viewer.
 */
import { useState, useEffect, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { integrationIconUrl } from '../../integrationIcons'

interface CVEItem {
  id: string
  description: string
  severity: string
  cvssScore: number
  published: string
  url: string
}

interface SecPostureEntry {
  integrationId: string
  type: string
  name: string
  uiUrl?: string
  version?: string
  cves: CVEItem[]
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#65a30d', UNKNOWN: 'var(--text-dim)',
}

function worstSeverity(cves: CVEItem[]): string {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
  for (const s of order) if (cves.some(c => c.severity === s)) return s
  return ''
}

export default function SecurityPosturePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [entries, setEntries] = useState<SecPostureEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setEntries(res.data?.entries || [])
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>

  const totalCVEs = entries.reduce((sum, e) => sum + e.cves.length, 0)
  const worstOverall = worstSeverity(entries.flatMap(e => e.cves))

  // ── 1x — compact summary ──────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: worstOverall ? SEVERITY_COLOR[worstOverall] : 'var(--text)' }}>
          {totalCVEs}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          known CVEs across {entries.length} product{entries.length !== 1 ? 's' : ''}
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: 8 }}>
        No covered integrations configured yet. Security Posture tracks a curated set of
        network/storage-facing services (TrueNAS, OPNsense, Authentik, and similar) — add one
        as an integration and it'll appear here automatically.
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(e => {
        const worst = worstSeverity(e.cves)
        const isOpen = expanded === e.integrationId
        const icon = integrationIconUrl(e.type)
        return (
          <div key={e.integrationId} style={{
            border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
            background: 'var(--surface2)',
          }}>
            <div onClick={() => setExpanded(isOpen ? null : e.integrationId)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              cursor: e.cves.length > 0 ? 'pointer' : 'default',
            }}>
              {icon && <img src={icon} alt="" width={14} height={14} style={{ flexShrink: 0 }} onError={ev => { ev.currentTarget.style.display = 'none' }} />}
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
              </span>
              {e.version && (
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                  v{e.version}
                </span>
              )}
              {e.cves.length > 0 ? (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, flexShrink: 0,
                  background: SEVERITY_COLOR[worst] + '22', color: SEVERITY_COLOR[worst],
                }}>
                  {e.cves.length} CVE{e.cves.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>clean</span>
              )}
            </div>

            {isOpen && heightUnits >= 4 && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {e.cves.slice(0, 20).map(c => (
                  <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', flexDirection: 'column', gap: 2, textDecoration: 'none',
                    color: 'inherit', padding: '4px 6px', borderRadius: 6,
                  }}
                    onMouseOver={ev => ev.currentTarget.style.background = 'var(--surface)'}
                    onMouseOut={ev => ev.currentTarget.style.background = 'transparent'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: SEVERITY_COLOR[c.severity] + '22', color: SEVERITY_COLOR[c.severity],
                      }}>{c.severity}{c.cvssScore > 0 ? ` ${c.cvssScore}` : ''}</span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{c.id}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{c.published}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {c.description}
                    </div>
                  </a>
                ))}
                {e.cves.length > 20 && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                    +{e.cves.length - 20} more — see NVD for the full list
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
