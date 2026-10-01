import { describe, expect, it } from 'vitest'
import { SessionSnapshots } from '../../../src/browser-extension/session-snapshots'

describe('session snapshot generations', () => {
  it('prefixes tree and action references with a fresh snapshot id', () => {
    let sequence = 0
    const snapshots = new SessionSnapshots(() => `snapshot-${++sequence}`)
    const first = snapshots.save('a', 10, [{ role: 'button', ref: 'r1' }], [{ ref: 'r1', backendDOMNodeId: 7 }])
    expect(first.tree[0].ref).toBe('snapshot-1:r1')
    expect(snapshots.resolve('a', 10, 'snapshot-1:r1')).toBe(7)
    snapshots.save('a', 10, [{ role: 'button', ref: 'r1' }], [{ ref: 'r1', backendDOMNodeId: 8 }])
    expect(() => snapshots.resolve('a', 10, first.tree[0].ref!)).toThrow('STALE_SNAPSHOT')
  })

  it('keeps separate owners and rejects cross-owner or wrong-tab refs', () => {
    let sequence = 0
    const snapshots = new SessionSnapshots(() => `snapshot-${++sequence}`)
    snapshots.save('a', 10, [], [{ ref: 'r1', backendDOMNodeId: 7 }])
    snapshots.save('b', 20, [], [{ ref: 'r1', backendDOMNodeId: 8 }])
    expect(snapshots.resolve('a', 10, 'snapshot-1:r1')).toBe(7)
    expect(snapshots.resolve('b', 20, 'snapshot-2:r1')).toBe(8)
    expect(() => snapshots.resolve('b', 20, 'snapshot-1:r1')).toThrow('STALE_SNAPSHOT')
    expect(() => snapshots.resolve('a', 20, 'snapshot-1:r1')).toThrow('STALE_SNAPSHOT')
    snapshots.invalidateTab(10)
    expect(() => snapshots.resolve('a', 10, 'snapshot-1:r1')).toThrow('STALE_SNAPSHOT')
    expect(snapshots.resolve('b', 20, 'snapshot-2:r1')).toBe(8)
  })
})
