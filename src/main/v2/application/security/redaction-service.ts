const secretKey = /authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password/i
const bearer = /^Bearer\s+\S+/i
const secretAssignment = /(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password)\s*[:=]\s*\S+/gi

export function redactObject<T>(value: T, options: {
  knownValues?: readonly string[]
} = {}): T {
  const known = [...new Set((options.knownValues ?? []).filter(item => item.length > 0))]
    .sort((a, b) => b.length - a.length)
  const seen = new WeakMap<object, unknown>()
  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') {
      if (bearer.test(current)) return '[REDACTED]'
      const scrubbed = current.replace(secretAssignment, '[REDACTED]')
      return known.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), scrubbed)
    }
    if (current === null || typeof current !== 'object') return current
    const existing = seen.get(current)
    if (existing) return existing
    if (Array.isArray(current)) {
      const output: unknown[] = []
      seen.set(current, output)
      for (const item of current) output.push(visit(item))
      return output
    }
    const output: Record<string, unknown> = {}
    seen.set(current, output)
    for (const [key, child] of Object.entries(current)) {
      output[key] = secretKey.test(key) ? '[REDACTED]' : visit(child)
    }
    return output
  }
  return visit(value) as T
}
