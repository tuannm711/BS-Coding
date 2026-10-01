import { describe, expect, it } from 'vitest'
import { NativeFrameDecoder, encodeNativeFrame } from '../../../src/main/browser/native-framing'

describe('native JSON framing', () => {
  it('decodes multiple UTF-8 messages across arbitrary byte boundaries', () => {
    const decoder = new NativeFrameDecoder(1024)
    const wire = Buffer.concat([encodeNativeFrame({ text: 'Xin chào 👋' }), encodeNativeFrame({ ok: true })])
    const frames = [...wire].flatMap(byte => decoder.push(Buffer.from([byte])))
    expect(frames).toEqual([{ text: 'Xin chào 👋' }, { ok: true }])
    decoder.finish()
  })
  it('rejects oversized announced frames before allocating the body', () => {
    const prefix = Buffer.alloc(4); prefix.writeUInt32LE(4096)
    expect(() => new NativeFrameDecoder(100).push(prefix)).toThrow(/limit|large/i)
  })
  it('rejects malformed, zero-length and truncated messages', () => {
    expect(() => new NativeFrameDecoder().push(Buffer.alloc(4))).toThrow()
    const invalid = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from('{')])
    expect(() => new NativeFrameDecoder().push(invalid)).toThrow()
    const decoder = new NativeFrameDecoder(); decoder.push(Buffer.from([12, 0]))
    expect(() => decoder.finish()).toThrow(/truncated/i)
  })
})
