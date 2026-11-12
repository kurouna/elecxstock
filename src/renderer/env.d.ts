/// <reference types="svelte" />
/// <reference types="vite/client" />
import type { ElecxstockBridge } from '@shared/bridge'

declare global {
  interface Window {
    elecxstock: ElecxstockBridge
  }
  const __APP_VERSION__: string
}
