import { z } from 'zod'

const id = z.string().min(1)
const timestamp = z.iso.datetime({ offset: true })

export const RemoteDeviceSummarySchema = z.object({
  id,
  name: id,
  status: z.enum(['ONLINE', 'OFFLINE']),
  pairedAt: timestamp.optional(),
  lastSeenAt: timestamp.optional()
})

export const PairingStatusSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(['DISABLED', 'OFFLINE', 'CONNECTING', 'PAIRING', 'CONNECTED', 'ERROR']),
  code: z.string().regex(/^\d{6}$/).optional(),
  expiresAt: timestamp.optional(),
  devices: z.array(RemoteDeviceSummarySchema),
  message: z.string().optional()
}).superRefine((value, context) => {
  const hasCode = value.code !== undefined
  const hasExpiry = value.expiresAt !== undefined
  if (hasCode !== hasExpiry || (value.state === 'PAIRING' && (!hasCode || !hasExpiry))) {
    context.addIssue({ code: 'custom', path: ['code'],
      message: 'pairing code and expiry are required together while pairing' })
  }
})

export const RemoteAuditEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONNECTION'),
    state: z.enum(['DISABLED', 'OFFLINE', 'CONNECTING', 'PAIRING', 'CONNECTED', 'ERROR']),
    deviceId: id.optional(), timestamp }),
  z.object({ type: z.literal('PRIVILEGED_COMMAND'), command: id,
    deviceId: id.optional(), timestamp })
])
