import type { Permission } from '../../../../shared/v2/contracts/tools'
import type { PermissionProfileLayers } from '../../../../shared/v2/contracts/permissions'
import { resolvePermissionPolicy } from '../../domain/security/permission-policy'
export type { Permission } from '../../../../shared/v2/contracts/tools'

export interface PermissionLayers extends PermissionProfileLayers {}

export function resolvePermission(layers: PermissionLayers): Permission {
  return resolvePermissionPolicy(layers)
}
