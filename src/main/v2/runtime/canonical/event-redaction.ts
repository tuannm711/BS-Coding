const secretKey = /authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password/i

export function redactEventPayload<T>(value: T): T {
  const copy = structuredClone(value)
  const seen = new WeakSet<object>()
  const visit = (current: unknown): void => {
    if (current === null || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    if (Array.isArray(current)) {
      for (const item of current) visit(item)
      return
    }
    for (const [key, child] of Object.entries(current)) {
      if (secretKey.test(key)) (current as Record<string, unknown>)[key] = '[REDACTED]'
      else visit(child)
    }
  }
  visit(copy)
  return copy
}
