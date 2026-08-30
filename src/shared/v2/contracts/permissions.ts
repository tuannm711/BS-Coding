import type { Permission } from './tools'

export type PermissionSource =
  | 'HARD_SECURITY' | 'WORK_SESSION' | 'AGENT' | 'PROJECT' | 'GLOBAL' | 'DEFAULT'

export interface PermissionProfileLayers {
  hardSecurity?: Permission
  workSession?: Permission
  agent?: Permission
  project?: Permission
  global?: Permission
}

export interface EffectivePermission {
  decision: Permission
  source: PermissionSource
  reason: string
}
