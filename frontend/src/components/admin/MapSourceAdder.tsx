/**
 * MapSourceAdder — shared Map source manager used by both system settings
 * (isSystem=true) and personal profile (isSystem=false). Mirrors
 * CalendarSourceAdder's shape; deliberately simpler since Map sources have
 * no per-source config (no day windows) and, for now, only one source type.
 */
import { useState } from 'react'
import { panelsApi, myPanelsApi } from '../../api'

export default function MapSourceAdder({ panelId, panelTitle, panelConfig, isSystem, integrations, onAdded }: {
  panelId: string; panelTitle: string; panelConfig: string; isSystem: boolean
  integrations: any[]; onAdded: () => void
}) {
  const [intId, setIntId] = useState('')
  const [adding, setAdding] = useState(false)

  const cfg = (() => { try { return JSON.parse(panelConfig || '{}') } catch { return {} } })()
  const sources: any[] = cfg.sources || []

  const mapIntegrations = integrations.filter((i: any) => i.type === 'life360')
  const usedIds = new Set(sources.map((s: any) => s.integrationId))
  const availableIntegrations = mapIntegrations.filter((i: any) => !usedIds.has(i.id))

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
    if (!intId) return
    setAdding(true)
    try {
      const ig = integrations.find((i: any) => i.id === intId)
      await updateSources([...sources, { type: 'life360', integrationId: intId, label: ig?.name || 'Life360' }])
      setIntId('')
    } finally { setAdding(false) }
  }

  const sourceLabel = (src: any) => {
    const ig = integrations.find((i: any) => i.id === src.integrationId)
    return `📍 ${src.label || ig?.name || 'Life360'}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="label">Map sources</label>

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
      {availableIntegrations.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" value={intId} onChange={e => setIntId(e.target.value)}
            style={{ cursor: 'pointer', flex: 1, minWidth: 160, fontSize: 12 }}>
            <option value="">— Select Life360 integration —</option>
            {availableIntegrations.map((i: any) => (
              <option key={i.id} value={i.id}>{i.name}{(i as any).enabled === false ? ' — disabled' : ''}</option>
            ))}
          </select>
          <button className="btn btn-secondary" style={{ fontSize: 12 }}
            onClick={add} disabled={adding || !intId}>
            {adding ? <span className="spinner" /> : 'Add'}
          </button>
        </div>
      ) : mapIntegrations.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          No Life360 integration configured yet — add one in Admin → Integrations first.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          All configured Life360 integrations are already added.
        </div>
      )}
    </div>
  )
}
