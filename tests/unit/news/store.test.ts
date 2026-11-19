// ニュースの画面の状態（src/renderer/news/store.svelte.ts）: 表示言語を Core に伝える（L2。Core にはつながず、呼び出しを記録する）
import { describe, expect, it, vi } from 'vitest'

const calls: { method: string; params: unknown }[] = []
vi.stubGlobal('window', {
  elecxstock: {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params })
      if (method === 'news.settings.get') return { registry: [] }
      return undefined
    },
    on: () => () => {},
    prioritize: () => {},
  },
})
vi.stubGlobal('document', { querySelector: () => null, activeElement: null, visibilityState: 'visible', addEventListener: () => {} })
const { app } = await import('../../../src/renderer/stores/app.svelte')
const { loadNews } = await import('../../../src/renderer/news/store.svelte')

describe('FR-NW1 表示言語の切り替え（ペインを開いていないとき）', () => {
  it('ニュースを読み直すとき、今の表示言語を Core に先に伝える（設定の「ニュース」だけを開いても通信先が表示言語に合う）', async () => {
    app.settings.lang = 'en'
    calls.length = 0
    await loadNews()
    const watch = calls.findIndex((c) => c.method === 'news.watch')
    expect(watch).toBeGreaterThanOrEqual(0)
    expect(calls[watch]!.params).toEqual({ on: false, lang: 'en' })
    expect(watch).toBeLessThan(calls.findIndex((c) => c.method === 'news.settings.get'))
    // 言語が変わっていなければ送り直さない
    calls.length = 0
    await loadNews()
    expect(calls.filter((c) => c.method === 'news.watch')).toHaveLength(0)
    app.settings.lang = 'ja'
    await loadNews()
    expect(calls.filter((c) => c.method === 'news.watch').map((c) => c.params)).toEqual([{ on: false, lang: 'ja' }])
  })
})
