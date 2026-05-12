/**
 * CalendarSourceAdder — shared calendar source manager used by both
 * system settings (isSystem=true) and personal profile (isSystem=false).
 * Owns both the existing source list (with remove) and the add new source form.
 */
import { useState, useEffect } from 'react'
import { panelsApi, myPanelsApi, googleApi, Panel } from '../../api'

export default function CalendarSourceAdder({ panelId, panelTitle, panelConfig, isSystem, integrations, onAdded }: {
  panelId: string; panelTitle: string; panelConfig: string; isSystem: boolean
  integrations: any[]; onAdded: () => void
}) {
  const [sourceKind, setSourceKind] = useState('')
  const [intId, setIntId] = useState('')
  const [googleTokenId, setGoogleTokenId] = useState('')
  const [googleCalendarId, setGoogleCalendarId] = useState('primary')
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([])
  const [googleTokens, setGoogleTokens] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [checklistPanels, setChecklistPanels] = useState<Panel[]>([])
  const [checklistPanelId, setChecklistPanelId] = useState('')

  const cfg = (() => { try { return JSON.parse(panelConfig || '{}') } catch { return {} } })()
  const sources: any[] = cfg.sources || []

  // Integrations eligible as calendar sources
  const calIntegrations = integrations.filter((i: any) =>
    ['sonarr','radarr','readarr','lidarr','weather','sports'].includes(i.type)
  )

  useEffect(() => {
    googleApi.getConfig().then((res: any) => {
      if (res.data?.configured) {
        googleApi.listTokens(isSystem ? 'system' : 'personal')
          .then((r: any) => setGoogleTokens(r.data || []))
          .catch(() => {})
      }
    }).catch(() => {})
    myPanelsApi.list().then((r: any) =>
      setChecklistPanels((r.data || []).filter((p: any) => p.type === 'checklist'))
    ).catch(() => {})
  }, [isSystem])

  useEffect(() => {
    if (googleTokenId) {
      googleApi.listCalendars(googleTokenId).then((r: any) => {
        setGoogleCalendars(r.data || [])
        setGoogleCalendarId('primary')
      })
    }
  }, [googleTokenId])

  const updateSources = async (newSources: any[]) => {
    const updater = isSystem ? panelsApi : myPanelsApi
    await updater.update(panelId, {
      title: panelTitle,
      config: JSON.stringify({ ...cfg, sources: newSources })
    })
    onAdded()
  }

  const remove = async (idx: number) => {
    await updateSources(sources.filter((_: any, i: number) => i !== idx))
  }

  const add = async () => {
    if (!sourceKind) return
    setAdding(true)
    try {
      let newSource: any
      if (sourceKind === 'google') {
        if (!googleTokenId) return
        const tok = googleTokens.find((t: any) => t.id === googleTokenId)
        newSource = {
          type: 'google', integrationId: googleTokenId,
          calendarId: googleCalendarId, daysAhead: 14,
          label: tok?.email || googleTokenId
        }
      } else if (sourceKind === 'checklist') {
        if (!checklistPanelId) return
        const cl = checklistPanels.find((p: any) => p.id === checklistPanelId)
        newSource = { type: 'checklist', panelId: checklistPanelId, label: cl?.title || 'Checklist' }
      } else if (sourceKind === 'integration') {
        if (!intId) return
        const ig = integrations.find((i: any) => i.id === intId)
        newSource = { type: ig?.type, integrationId: intId, daysAhead: 14, label: ig?.name || ig?.type }
      }
      if (newSource) {
        await updateSources([...sources, newSource])
        setIntId(''); setGoogleTokenId(''); setChecklistPanelId(''); setSourceKind('')
      }
    } finally { setAdding(false) }
  }

  const sourceLabel = (src: any) => {
    const ig = integrations.find((i: any) => i.id === src.integrationId)
    if (src.type === 'google') return `📅 ${src.label || src.integrationId}`
    if (src.type === 'checklist') return `☑ ${src.label || 'Checklist'}`
    if (src.type === 'weather') return `🌤 ${src.label || ig?.name || 'Weather'}`
    if (src.type === 'sports') return `🏒 ${src.label || ig?.name || 'Sports'}`
    return ig?.name ?? src.label ?? src.type
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="label">Calendar sources</label>

      {/* Existing sources */}
      {sources.map((src: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'var(--surface2)', borderRadius: 7, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{sourceLabel(src)}</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
            onClick={() => remove(i)}>Remove</button>
        </div>
      ))}

      {/* Add source row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" value={sourceKind}
          onChange={e => { setSourceKind(e.target.value); setIntId(''); setGoogleTokenId(''); setChecklistPanelId('') }}
          style={{ cursor: 'pointer', minWidth: 160, fontSize: 12 }}>
          <option value="">+ Add source...</option>
          {calIntegrations.length > 0 && <option value="integration">Stoa integration</option>}
          {googleTokens.length > 0 && <option value="google">Google Calendar</option>}
          {checklistPanels.length > 0 && <option value="checklist">Checklist</option>}
        </select>

        {sourceKind === 'integration' && (
          <>
            <select className="input" value={intId} onChange={e => setIntId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select integration —</option>
              {calIntegrations.map((i: any) => (
                <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
              ))}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={add} disabled={adding || !intId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'google' && (
          <>
            <select className="input" value={googleTokenId} onChange={e => setGoogleTokenId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select account —</option>
              {googleTokens.map((t: any) => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
            {googleCalendars.length > 0 && (
              <select className="input" value={googleCalendarId} onChange={e => setGoogleCalendarId(e.target.value)}
                style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
                {googleCalendars.map((c: any) => <option key={c.id} value={c.id}>{c.summary}</option>)}
              </select>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={add} disabled={adding || !googleTokenId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'checklist' && (
          <>
            <select className="input" value={checklistPanelId} onChange={e => setChecklistPanelId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select checklist panel —</option>
              {checklistPanels.map((p: Panel) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={add} disabled={adding || !checklistPanelId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
