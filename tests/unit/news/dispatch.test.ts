// ニュースの要求の処理（dispatch.ts。L3）: zod の検証・フリー N の制限・通信先の一覧
import { dispatch } from '@core/dispatch'
import type { CoreService } from '@core/service'
import { describe, expect, it } from 'vitest'

const calls: { method: string; params: unknown; slot: string }[] = []
const news = {
  call: async (method: string, params: unknown, slot: string) => {
    calls.push({ method, params, slot })
    return method === 'news.list' ? { state: 'off' } : undefined
  },
  hosts: () => ['www.boj.or.jp'],
  removeAll: () => {},
}
const ctx = { prioritize: () => {}, news: news as never }
const svc = {} as CoreService
const run = (slot: string, method: string, params: unknown = {}) => dispatch(svc, ctx, slot, { id: 1, method, params })

describe('FR-NW1 ニュースの要求の処理', () => {
  it('news.* は検証してから NewsService に、窓のスロットを付けて渡す', async () => {
    const r = await run('main', 'news.watch', { on: true, lang: 'ja' })
    expect(r.reply).toEqual({ id: 1, result: undefined })
    expect(calls.at(-1)).toEqual({ method: 'news.watch', params: { on: true, lang: 'ja' }, slot: 'main' })
    const bad = await run('main', 'news.settings.set', { interval: -1 })
    expect('error' in bad.reply && bad.reply.error.code).toBe('invalid-params')
  })
  it('フリー N からは読むことだけ（ペインはフリー N に置かない）', async () => {
    expect((await run('free2', 'news.list')).reply).toEqual({ id: 1, result: { state: 'off' } })
    const w = await run('free2', 'news.settings.set', { enabled: true })
    expect('error' in w.reply && w.reply.error.code).toBe('invalid-params')
  })
  it('このアプリの通信先: 既存の許可リストとニュースのオンのフィードのホスト', async () => {
    const r = await run('main', 'app.endpoints')
    expect(r.reply).toEqual({ id: 1, result: { app: ['*.yahoo.com', 'www.jpx.co.jp', 'api.github.com'], news: ['www.boj.or.jp'] } })
  })
  it('全データの削除（jobs.reset）のあとはニュースのキャッシュも消す', async () => {
    let removed = 0
    const core = { call: async () => 1 } as unknown as CoreService
    await dispatch(core, { prioritize: () => {}, news: { ...news, removeAll: () => void removed++ } as never }, 'main', {
      id: 1,
      method: 'jobs.reset',
      params: { keepDelisted: true },
    })
    expect(removed).toBe(1)
  })
  it('ニュースが無いとき（テストの窓口など）は「見つからない」', async () => {
    const r = await dispatch(svc, { prioritize: () => {} }, 'main', { id: 1, method: 'news.list', params: {} })
    expect('error' in r.reply && r.reply.error.code).toBe('not-found')
  })
})
