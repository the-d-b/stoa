/**
 * CalendarSourceAdder — shared calendar source manager used by both
 * system settings (isSystem=true) and personal profile (isSystem=false).
 * Owns both the existing source list (with remove) and the add new source form.
 */
import { useState, useEffect } from 'react'
import { panelsApi, myPanelsApi, googleApi, Panel } from '../../api'

// Note: @hello-pangea/dnd acknowledged in panels.md

const DAYS_OPTIONS = [7, 14, 30, 60, 90]
// Source types where daysAhead controls the fetch window
const DAYS_AHEAD_TYPES = new Set(['sonarr', 'radarr', 'readarr', 'lidarr', 'google'])

export default function CalendarSourceAdder({ panelId, panelTitle, panelConfig, isSystem, integrations, onAdded }: {
  panelId: string; panelTitle: string; panelConfig: string; isSystem: boolean
  integrations: any[]; onAdded: () => void
}) {
  const [sourceKind, setSourceKind] = useState('')
  const [intId, setIntId] = useState('')
  const [daysAhead, setDaysAhead] = useState(30)
  const [googleTokenId, setGoogleTokenId] = useState('')
  const [googleCalendarId, setGoogleCalendarId] = useState('primary')
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([])
  const [googleTokens, setGoogleTokens] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [checklistPanels, setChecklistPanels] = useState<Panel[]>([])
  const [checklistPanelId, setChecklistPanelId] = useState('')
  const [kanbanPanels, setKanbanPanels] = useState<Panel[]>([])
  const [kanbanPanelId, setKanbanPanelId] = useState('')

  const cfg = (() => { try { return JSON.parse(panelConfig || '{}') } catch { return {} } })()
  const sources: any[] = cfg.sources || []

  // Integrations eligible as calendar sources
  const calIntegrations = integrations.filter((i: any) =>
    ['sonarr','radarr','readarr','lidarr','weather','sports','lubelogger'].includes(i.type)
  )

  useEffect(() => {
    googleApi.getConfig().then((res: any) => {
      if (res.data?.configured) {
        googleApi.listTokens(isSystem ? 'system' : 'personal')
          .then((r: any) => setGoogleTokens(r.data || []))
          .catch(() => {})
      }
    }).catch(() => {})
    panelsApi.list().then((r: any) => {
      const panels = r.data || []
      setChecklistPanels(panels.filter((p: any) => p.type === 'checklist'))
      setKanbanPanels(panels.filter((p: any) => p.type === 'kanban'))
    }).catch(() => {})
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

  const updateDays = async (idx: number, days: number) => {
    await updateSources(sources.map((s: any, i: number) => i === idx ? { ...s, daysAhead: days } : s))
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
          calendarId: googleCalendarId, daysAhead,
          label: tok?.email || googleTokenId
        }
      } else if (sourceKind === 'checklist') {
        if (!checklistPanelId) return
        const cl = checklistPanels.find((p: any) => p.id === checklistPanelId)
        newSource = { type: 'checklist', panelId: checklistPanelId, label: cl?.title || 'Checklist' }
      } else if (sourceKind === 'kanban') {
        if (!kanbanPanelId) return
        const kb = kanbanPanels.find((p: any) => p.id === kanbanPanelId)
        newSource = { type: 'kanban', panelId: kanbanPanelId, label: kb?.title || 'Kanban' }
      } else if (sourceKind === 'integration') {
        if (!intId) return
        const ig = integrations.find((i: any) => i.id === intId)
        newSource = { type: ig?.type, integrationId: intId, daysAhead, label: ig?.name || ig?.type }
      }
      if (newSource) {
        await updateSources([...sources, newSource])
        setIntId(''); setGoogleTokenId(''); setChecklistPanelId(''); setKanbanPanelId(''); setSourceKind(''); setDaysAhead(30)
      }
    } finally { setAdding(false) }
  }

  const sourceLabel = (src: any) => {
    const ig = integrations.find((i: any) => i.id === src.integrationId)
    if (src.type === 'google') return `📅 ${src.label || src.integrationId}`
    if (src.type === 'checklist') return `☑ ${src.label || 'Checklist'}`
    if (src.type === 'kanban') return `▦ ${src.label || 'Kanban'}`
    if (src.type === 'weather') return `🌤 ${src.label || ig?.name || 'Weather'}`
    if (src.type === 'sports') return `🏒 ${src.label || ig?.name || 'Sports'}`
    if (src.type === 'lubelogger') return `🔧 ${src.label || ig?.name || 'LubeLogger'}`
    return ig?.name ?? src.label ?? src.type
  }

  const showDaysSelect = (sourceKind === 'integration' && !!intId &&
    DAYS_AHEAD_TYPES.has(integrations.find((i: any) => i.id === intId)?.type || ''))
    || sourceKind === 'google'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="label">Calendar sources</label>

      {/* Existing sources */}
      {sources.map((src: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'var(--surface2)', borderRadius: 7, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{sourceLabel(src)}</span>
          {DAYS_AHEAD_TYPES.has(src.type) && (
            <select
              value={src.daysAhead ?? 30}
              onChange={e => updateDays(i, Number(e.target.value))}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', borderRadius: 5, fontSize: 11,
                padding: '2px 4px', cursor: 'pointer',
              }}
              title="Days ahead to fetch"
            >
              {DAYS_OPTIONS.map(d => <option key={d} value={d}>{d}d</option>)}
            </select>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
            onClick={() => remove(i)}>Remove</button>
        </div>
      ))}

      {/* Add source row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" value={sourceKind}
          onChange={e => { setSourceKind(e.target.value); setIntId(''); setGoogleTokenId(''); setChecklistPanelId(''); setDaysAhead(30) }}
          style={{ cursor: 'pointer', minWidth: 160, fontSize: 12 }}>
          <option value="">+ Add source...</option>
          {calIntegrations.length > 0 && <option value="integration">Stoa integration</option>}
          {googleTokens.length > 0 && <option value="google">Google Calendar</option>}
          {checklistPanels.length > 0 && <option value="checklist">Checklist</option>}
          {kanbanPanels.length > 0 && <option value="kanban">Kanban</option>}
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
            {showDaysSelect && (
              <select className="input" value={daysAhead} onChange={e => setDaysAhead(Number(e.target.value))}
                style={{ cursor: 'pointer', width: 100, fontSize: 12 }}>
                {DAYS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            )}
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
            <select className="input" value={daysAhead} onChange={e => setDaysAhead(Number(e.target.value))}
              style={{ cursor: 'pointer', width: 100, fontSize: 12 }}>
              {DAYS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
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

        {sourceKind === 'kanban' && (
          <>
            <select className="input" value={kanbanPanelId} onChange={e => setKanbanPanelId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select kanban panel —</option>
              {kanbanPanels.map((p: Panel) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={add} disabled={adding || !kanbanPanelId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
