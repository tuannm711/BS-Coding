import type { ToolDefinition } from './tools/types'

interface ValidationIssue {
  path?: PropertyKey[]
  message?: string
}

interface SafeParseSuccess {
  success: true
  data: unknown
}

interface SafeParseFailure {
  success: false
  error: { issues?: ValidationIssue[] }
}

type ToolInputValidation =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; error: string }

export function validateToolInput(
  definition: ToolDefinition,
  input: Record<string, unknown>
): ToolInputValidation {
  const schema = definition.schema as {
    safeParse?: (value: unknown) => SafeParseSuccess | SafeParseFailure
  }
  if (typeof schema.safeParse !== 'function') return { ok: true, input }

  const parsed = schema.safeParse(input)
  if (parsed.success) return { ok: true, input: parsed.data as Record<string, unknown> }

  const detail = (parsed.error.issues ?? []).map(issue => {
    const location = issue.path?.length ? issue.path.map(String).join('.') : 'input'
    return `${location}: ${issue.message ?? 'invalid value'}`
  }).join('; ') || 'input: invalid value'
  return { ok: false, error: `${definition.name}: invalid input: ${detail}` }
}
