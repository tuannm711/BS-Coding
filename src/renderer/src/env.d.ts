/// <reference types="vite/client" />
import type { AgentApi } from '../../shared/ipc'
import type { BsV2Api } from '../../shared/v2/contracts/ipc'

declare global {
  interface Window {
    api: AgentApi
    bs: { v2: BsV2Api }
  }
}
export {}
