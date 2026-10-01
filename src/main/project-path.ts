import path from 'node:path'

export function canonicalProjectPath(value: string): string {
  const resolved = path.resolve(value).replace(/\\/g, '/')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** Rebase only paths inside this project; an agent may deliberately use an external cwd. */
export function rebaseProjectPath(value: string, previous: string, next: string): string {
  const relative = path.relative(previous, value)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return value
  return path.resolve(next, relative)
}
