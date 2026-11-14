// 画面のロジックの結合のテスト（L4）の窓口: window.elecxstock を、製品と同じ経路（dispatch: 窓の制限 → zod の検証 → 呼び出し →
// 変更の通知）で同じプロセスの CoreService につなぐ。引数と結果は構造化複製する（Svelte の Proxy をそのまま送ると製品では落ちる）。
// main の機能（ファイルの保存・ダイアログ）は記録するだけの偽物（docs/testing.md）
import { dispatch } from '@core/dispatch'
import type { TestCore } from './core'

export interface FakeMain {
  saved: { name: string; text: string }[]
  /** 次の openFile が返すもの */
  nextOpen: string | Uint8Array | null
}

export function installBridge(core: TestCore, slot = 'main'): FakeMain {
  const listeners = new Map<string, Set<(d: unknown) => void>>()
  const emit = (event: string, data: unknown) => {
    for (const f of listeners.get(event) ?? []) f(structuredClone(data))
  }
  core.onEvent((e) => emit(e.event, e.data))
  const fake: FakeMain = { saved: [], nextOpen: null }
  let seq = 0
  const ctx = { prioritize: () => {} }
  const api = {
    async call(method: string, params: unknown) {
      const { reply, notice } = await dispatch(core.svc, ctx, slot, { id: ++seq, method, params: structuredClone(params) })
      if (notice) queueMicrotask(() => emit(notice.event, notice.data))
      if ('error' in reply) throw reply.error
      return structuredClone(reply.result)
    },
    on(event: string, cb: (d: unknown) => void) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(cb)
      return () => set.delete(cb)
    },
    prioritize: () => {},
    openExternal: async () => true,
    saveText: async (name: string, text: string) => {
      fake.saved.push({ name, text })
      return true
    },
    openFile: async () => fake.nextOpen,
    platform: 'win32',
  }
  ;(globalThis as { window?: unknown }).window = {
    elecxstock: new Proxy(api, { get: (t, p) => (t as Record<string | symbol, unknown>)[p] ?? (async () => null) }),
  }
  return fake
}
