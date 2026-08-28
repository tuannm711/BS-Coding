// Serializable primitives shared across main, preload and renderer.
// No Node/Electron imports: this file crosses the process boundary.

export type EntityId = string
export type IsoDateTime = string

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

export const success = <T>(value: T): CommandResult<T> => ({ ok: true, value })

export const failure = <T = never>(code: string, message: string): CommandResult<T> => ({
  ok: false,
  error: { code, message }
})
