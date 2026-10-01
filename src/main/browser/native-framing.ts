const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

export function encodeNativeFrame(value: unknown, maxBytes = DEFAULT_MAX_BYTES): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  if (!body.length || body.length > maxBytes) throw new Error('Native message exceeds frame limit')
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32LE(body.length)
  return Buffer.concat([prefix, body])
}

export class NativeFrameDecoder {
  private buffer = Buffer.alloc(0)
  constructor(private readonly maxBytes = DEFAULT_MAX_BYTES) {}
  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const frames: unknown[] = []
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE(0)
      if (!size || size > this.maxBytes) throw new Error('Native frame exceeds limit')
      if (this.buffer.length < size + 4) break
      const text = new TextDecoder('utf-8', { fatal: true }).decode(this.buffer.subarray(4, size + 4))
      const value: unknown = JSON.parse(text)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Native message must be an object')
      frames.push(value)
      this.buffer = this.buffer.subarray(size + 4)
    }
    return frames
  }
  finish(): void { if (this.buffer.length) throw new Error('Truncated native frame') }
}
