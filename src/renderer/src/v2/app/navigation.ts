export type V2ScreenId = 'home' | 'projects' | 'work' | 'agents' | 'settings'

export interface V2NavigationItem {
  readonly id: V2ScreenId
  readonly label: string
  readonly icon: 'home' | 'projects' | 'work' | 'agents' | 'settings'
}

export const V2_NAV_ITEMS: readonly V2NavigationItem[] = Object.freeze([
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'projects', label: 'Projects', icon: 'projects' },
  { id: 'work', label: 'Work', icon: 'work' },
  { id: 'agents', label: 'Agents', icon: 'agents' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
])

export function rendererMode(v2Enabled: boolean): 'v1' | 'v2' {
  return v2Enabled ? 'v2' : 'v1'
}
