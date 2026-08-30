import type { AgentSettingsProjection } from '../../../../../shared/v2/contracts/ui-projections'
import type { GLOBAL_SETTINGS } from '../SettingsScreen'

type Panel = typeof GLOBAL_SETTINGS[number]
const descriptions: Record<Exclude<Panel, 'Providers'>, string> = {
  Application: 'Application behavior and startup preferences.', Appearance: 'Theme, density and editor presentation.',
  Security: 'Vault-backed credentials and hard security policy.',
  'Default Permissions': 'Default permission policy before project and agent overrides.',
  Updates: 'Update channel and installation policy.', 'Remote Control': 'Safe remote relay status and pairing policy.'
}

export function StaticSettingsPanel({ panel, projection }: { panel: Exclude<Panel, 'Providers'>; projection: AgentSettingsProjection | null }) {
  const credentials = projection ? Object.entries(projection.globalSettings.providerCredentials) : []
  return <section className="v2-static-settings"><p className="v2-kicker">Global settings</p><h2>{panel}</h2><p>{descriptions[panel]}</p>
    {panel === 'Security' ? <div className="v2-credential-list"><h3>Credential metadata</h3>{credentials.length ? credentials.map(([id, value]) => <div key={id}><span>{id}</span><span className="v2-status-pill">{value.configured ? 'Configured' : 'Not configured'}</span></div>)
      : <div className="v2-panel-state">No provider credential metadata.</div>}</div> : <div className="v2-panel-state">This V2 settings panel will bind to its typed contract in the owning plan. No V1 setting is written from here.</div>}
  </section>
}
