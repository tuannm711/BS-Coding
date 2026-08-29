import type { Permission } from '../../../../shared/v2/contracts/tools'
export type { Permission } from '../../../../shared/v2/contracts/tools'

export interface PermissionLayers {
  hardSecurity?: Permission
  workSession?: Permission
  agent?: Permission
  project?: Permission
  global?: Permission
}

export function resolvePermission(layers: PermissionLayers): Permission {
  if (layers.hardSecurity === 'DENY') return 'DENY'
  return layers.workSession ?? layers.agent ?? layers.project ?? layers.global ?? 'ASK'
}
