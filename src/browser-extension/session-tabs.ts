export class SessionTabs {
  private readonly defaults = new Map<string, number>()
  private readonly leases = new Map<number, string>()
  constructor(saved: unknown = {}) {
    if (!saved || typeof saved !== 'object') return
    const value = saved as { version?: unknown; defaults?: Record<string, number>; leases?: Record<string, string> }
    if (value.version === 2) {
      for (const [tab, owner] of Object.entries(value.leases ?? {})) {
        const id = Number(tab)
        if (this.validOwner(owner) && this.validTab(id) && !this.leases.has(id)) this.leases.set(id, owner)
      }
      for (const [owner, tab] of Object.entries(value.defaults ?? {})) if (this.leases.get(tab) === owner) this.defaults.set(owner, tab)
    } else {
      for (const [owner, tab] of Object.entries(saved)) if (this.validOwner(owner) && this.validTab(tab) && !this.leases.has(tab)) { this.leases.set(tab, owner); this.defaults.set(owner, tab) }
    }
  }
  private validOwner(owner: unknown): owner is string { return typeof owner === 'string' && owner.length > 0 && owner.length <= 200 }
  private validTab(tab: unknown): tab is number { return typeof tab === 'number' && Number.isSafeInteger(tab) && tab >= 0 }
  bind(owner: string, tab: number): void {
    if (!this.validOwner(owner) || !this.validTab(tab)) throw new Error('Invalid tab assignment')
    const existing = this.ownerFor(tab)
    if (existing && existing !== owner) throw new Error('Tab is owned by another session')
    this.leases.set(tab, owner)
    this.defaults.set(owner, tab)
  }
  tabFor(owner: string): number | undefined { return this.defaults.get(owner) }
  ownerFor(tab: number): string | undefined { return this.leases.get(tab) }
  assertOwned(owner: string, tab: number): void { if (this.leases.get(tab) !== owner) throw new Error('Tab is not assigned to this session; assign it in Browser settings') }
  closed(tab: number): void {
    const owner = this.leases.get(tab)
    this.leases.delete(tab)
    // Explicitly reselect a remaining owned tab instead of guessing the user's active tab.
    if (owner && this.defaults.get(owner) === tab) this.defaults.delete(owner)
  }
  serialize(): { version: 2; defaults: Record<string, number>; leases: Record<string, string> } { return { version: 2, defaults: Object.fromEntries(this.defaults), leases: Object.fromEntries(this.leases) } }
}
