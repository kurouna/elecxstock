// 画面のモジュール（stores・lib）を Node で読み込むための最小の window（Core にはつながない。つなぐときは bridge.ts）
import { vi } from 'vitest'

export function stubWindow(): void {
  vi.stubGlobal('window', { elecxstock: { call: async () => undefined, on: () => () => {}, prioritize: () => {} } })
}
