// 画面のモジュール（stores・lib）を Node で読み込むための最小の window と document（Core にはつながない。つなぐときは bridge.ts）
import { vi } from 'vitest'

export function stubWindow(): void {
  vi.stubGlobal('window', { elecxstock: { call: async () => undefined, on: () => () => {}, prioritize: () => {} } })
  // ペインへのフォーカス（setFocus）は後で document を引く。要素は無いものとして返す
  vi.stubGlobal('document', { querySelector: () => null, activeElement: null })
}
