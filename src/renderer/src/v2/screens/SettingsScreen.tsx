import { useCallback, useEffect, useState } from 'react'
import type { AgentSettingsProjection } from '../../../../shared/v2/contracts/ui-projections'
import ProvidersPanel from './settings/ProvidersPanel'
import { StaticSettingsPanel } from './settings/panels'

export const GLOBAL_SETTINGS = [
  'Application', 'Appearance', 'Providers', 'Security',
  'Default Permissions', 'Updates', 'Remote Control'
] as const
type GlobalSettingsPanel = typeof GLOBAL_SETTINGS[number]

export default function SettingsScreen() {
  const [panel, setPanel] = useState<GlobalSettingsPanel>('Application')
  const [projection, setProjection] = useState<AgentSettingsProjection | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => { setProjection(await window.bs.v2['agent.list']({})) }, [])
  useEffect(() => { void refresh().catch(() => setError('Global settings projection is unavailable.')) }, [refresh])
  return <div className="v2-screen v2-settings-screen"><header className="v2-screen-header"><p className="v2-eyebrow">Global scope</p><h1>Settings</h1><p>Application-wide configuration. Project Agents remain in project scope.</p></header>
    <div className="v2-settings-layout"><nav aria-label="Global settings sections">{GLOBAL_SETTINGS.map(item => <button type="button" key={item}
      aria-current={panel === item ? 'page' : undefined} onClick={() => setPanel(item)}>{item}</button>)}</nav>
      <main>{error ? <div className="v2-panel-state" role="alert">{error}</div>
        : panel === 'Providers' ? <ProvidersPanel projection={projection} onRefresh={refresh} />
          : <StaticSettingsPanel panel={panel} projection={projection} />}</main></div>
  </div>
}
