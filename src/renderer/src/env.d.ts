/// <reference types="vite/client" />
import type { AgentApi } from '../../shared/ipc'
import type { BsV2Api } from '../../shared/v2/contracts/ipc'
import type { P15BackendApi } from '../../preload/p15-backend-api'

declare global {
  interface Window {
    api: AgentApi
    bs: { v2: BsV2Api & P15BackendApi }
  }
}
export {}
