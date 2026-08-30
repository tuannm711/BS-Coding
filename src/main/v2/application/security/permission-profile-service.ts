import type {
  EffectivePermission, PermissionProfileLayers, PermissionSource
} from '../../../../shared/v2/contracts/permissions'
import { resolvePermissionPolicy } from '../../domain/security/permission-policy'

const ordered: Array<[keyof PermissionProfileLayers, PermissionSource, string]> = [
  ['workSession', 'WORK_SESSION', 'work session policy'],
  ['agent', 'AGENT', 'agent policy'],
  ['project', 'PROJECT', 'project policy'],
  ['global', 'GLOBAL', 'global policy']
]

export function resolveEffectivePermission(layers: PermissionProfileLayers): EffectivePermission {
  const decision = resolvePermissionPolicy(layers)
  if (layers.hardSecurity === 'DENY') {
    return { decision, source: 'HARD_SECURITY', reason: 'hard security policy' }
  }
  for (const [key, source, reason] of ordered) {
    if (layers[key] !== undefined) return { decision, source, reason }
  }
  return { decision, source: 'DEFAULT', reason: 'no configured policy' }
}
