import type { ProviderCapability, ProviderConnectRequest } from '../../shared/providers'
import type { ProviderAdapter } from './types'

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>()

  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.capability.id)) throw new Error(`[bs] Provider ${adapter.capability.id} already registered`)
    this.adapters.set(adapter.capability.id, adapter)
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.adapters.get(providerId)
  }

  listReady(): ProviderCapability[] {
    return [...this.adapters.values()]
      .map(adapter => adapter.capability)
      .filter(capability => capability.status !== 'unavailable')
  }

  methods(providerId: string) {
    return this.adapters.get(providerId)?.capability.methods ?? []
  }

  resolveRequest(request: ProviderConnectRequest): ProviderAdapter {
    const adapter = this.adapters.get(request.providerId)
    if (!adapter) throw new Error(`[bs] Provider ${request.providerId} chưa được hỗ trợ`)
    if (!adapter.capability.methods.some(method => method.id === request.methodId)) {
      throw new Error(`[bs] Phương thức kết nối không hợp lệ cho ${request.providerId}`)
    }
    return adapter
  }
}
