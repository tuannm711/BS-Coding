import type { Permission } from '../../../../shared/v2/contracts/tools'
import type { PermissionProfileLayers } from '../../../../shared/v2/contracts/permissions'

export function resolvePermissionPolicy(layers: PermissionProfileLayers): Permission {
  if (layers.hardSecurity === 'DENY') return 'DENY'
  return layers.workSession ?? layers.agent ?? layers.project ?? layers.global ?? 'ASK'
}
