import type { SnapshotNode } from '../shared/browser-types'
import type { AxSnapshotRef } from './ax-snapshot'

export class SessionSnapshots {
  private snapshots = new Map<string, { tabId: number; snapshotId: string; refs: Map<string, number> }>()
  private generations = new Map<number, number>()
  constructor(private readonly id: () => string = () => crypto.randomUUID()) {}
  generation(tabId: number): number { return this.generations.get(tabId) ?? 0 }
  clear(): void { this.snapshots.clear() }
  invalidateOwner(ownerId: string): void { this.snapshots.delete(ownerId) }
  invalidateTab(tabId: number): void {
    this.generations.set(tabId, this.generation(tabId) + 1)
    for (const [owner, snapshot] of this.snapshots) if (snapshot.tabId === tabId) this.snapshots.delete(owner)
  }
  save(ownerId: string, tabId: number, tree: SnapshotNode[], refs: AxSnapshotRef[]): { tree: SnapshotNode[]; snapshotId: string; tabId: number } {
    const snapshotId = this.id()
    const renamed = (nodes: SnapshotNode[]): SnapshotNode[] => nodes.map(node => ({
      ...node, ...(node.ref ? { ref: `${snapshotId}:${node.ref}` } : {}),
      ...(node.children ? { children: renamed(node.children) } : {})
    }))
    this.snapshots.set(ownerId, { tabId, snapshotId, refs: new Map(refs.map(ref => [`${snapshotId}:${ref.ref}`, ref.backendDOMNodeId])) })
    return { tree: renamed(tree), snapshotId, tabId }
  }
  resolve(ownerId: string, tabId: number, ref: string, snapshotId?: string): number {
    const snapshot = this.snapshots.get(ownerId)
    const backendId = snapshot?.tabId === tabId && (!snapshotId || snapshot.snapshotId === snapshotId) ? snapshot.refs.get(ref) : undefined
    if (backendId === undefined) throw new Error('STALE_SNAPSHOT: re-read this session tab before using the reference')
    return backendId
  }
}
