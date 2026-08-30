import { z } from 'zod'
import { ACCOUNT_POLICIES, CAPABILITY_HEALTH } from '../contracts/provider'

export const AccountPolicySchema = z.enum(ACCOUNT_POLICIES)
export const CapabilityHealthSchema = z.enum(CAPABILITY_HEALTH)
export const RuntimeTargetSchema = z.object({
  providerId: z.string().min(1),
  accountId: z.string().min(1),
  modelId: z.string().min(1),
  capabilities: z.object({ structuredTools: CapabilityHealthSchema })
}).strip()

export const RuntimeTargetCandidateSummarySchema = z.object({
  id: z.string().min(1),
  providerName: z.string().min(1),
  accountLabel: z.string().min(1),
  modelName: z.string().min(1),
  accountStatus: z.enum(['HEALTHY', 'COOLDOWN', 'EXPIRED', 'ERROR', 'UNKNOWN']),
  selectable: z.boolean(),
  unavailableReason: z.string().min(1).optional(),
  target: RuntimeTargetSchema.strict()
}).strict()
