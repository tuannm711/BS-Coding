import type { z } from 'zod'

export class V2IpcError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'INVALID_RESPONSE' | 'INTERNAL_ERROR', message: string) {
    super(message)
    this.name = 'V2IpcError'
  }
}

export function validatedHandler<TInput, TOutput>(contract: {
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  service(input: TInput): Promise<unknown>
}) {
  return async (_event: unknown, raw: unknown): Promise<TOutput> => {
    const input = contract.input.safeParse(raw)
    if (!input.success) throw new V2IpcError('INVALID_REQUEST', 'Invalid V2 IPC request')
    let result: unknown
    try {
      result = await contract.service(input.data)
    } catch (error) {
      if (error instanceof V2IpcError) throw error
      throw new V2IpcError('INTERNAL_ERROR', error instanceof Error ? error.message : 'V2 IPC service failed')
    }
    const output = contract.output.safeParse(result)
    if (!output.success) throw new V2IpcError('INVALID_RESPONSE', 'Invalid V2 IPC response')
    return output.data
  }
}
