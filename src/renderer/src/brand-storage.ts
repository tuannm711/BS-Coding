type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEYS = ['rightpanel.open', 'rightpanel.tab', 'rightpanel.width', 'sidebar.collapsed']

export function migrateBrandStorage(storage: StorageLike): void {
  for (const suffix of KEYS) {
    const legacyKey = `meow.${suffix}`
    const bsKey = `bs.${suffix}`
    const legacyValue = storage.getItem(legacyKey)
    if (storage.getItem(bsKey) === null && legacyValue !== null) storage.setItem(bsKey, legacyValue)
    if (legacyValue !== null) storage.removeItem(legacyKey)
  }
}
