// renderer からの 1 件の要求を処理する（§8.1）: 窓（スロット）ごとの制限 → zod の検証 → Core の呼び出し → 利用者のデータの変更の通知。
// worker（製品）と単体テストの窓口（tests/support/bridge.ts）が同じものを使う。electron を import しない（NFR-A1）。
import { type CoreError, type Events, type Method, PARAMS } from '@shared/api'
import { CHANGES, FREE_WRITES, MAIN_ONLY } from './changes'
import { ALLOWED_HOST_NAMES } from './netGuard'
import type { NewsService } from './news/service'
import type { CoreService } from './service'

export interface DispatchContext {
  /** 表示中の銘柄（FR-F8）。スロットごとに受け、和集合で使う */
  prioritize(slot: string, ids: string[]): void
  log?(msg: string): void
  /** ニュース（docs/design-news.md）。無ければ news.* は「使えない」 */
  news?: Pick<NewsService, 'call' | 'hosts' | 'removeAll'>
}
export type Reply = { id: number; result: unknown } | { id: number; error: CoreError }
/** 利用者のデータを変えたときに全窓へ送る知らせ。呼び出し元が返事を送ったあとに送る */
export type Notice = { event: keyof Events; data: Events['user.changed'] }

export async function dispatch(
  service: CoreService,
  ctx: DispatchContext,
  slot: string,
  msg: { id: number; method: string; params: unknown },
): Promise<{ reply: Reply; notice?: Notice }> {
  const { id, method } = msg
  try {
    if (method === 'jobs.prioritize') {
      const ids = Array.isArray(msg.params)
        ? msg.params.filter((x): x is string => typeof x === 'string' && x.length <= 24).slice(0, 200)
        : []
      ctx.prioritize(slot, ids)
      return { reply: { id, result: null } }
    }
    // フリー N は利用者のデータを読むだけ。書けるのは許可リスト（FREE_WRITES）のメソッドだけで、ほかの書き込み（CHANGES）と
    // MAIN_ONLY は 1 枚目だけ（docs/design-multimonitor.md §3.3。renderer の blockedInFree に頼らない）。
    // アラートは新しく作ることだけ（AL2。直す・消す・止める・既読は 1 枚目）。資産推移の記録を消す（FR-PF2）・レイアウトのページ（FR-L14）も 1 枚目
    if (slot !== 'main') {
      const newAlert = method === 'alerts.save' && !(msg.params as { alert?: { id?: unknown } } | null)?.alert?.id
      const writes = Object.hasOwn(CHANGES, method) || MAIN_ONLY.has(method)
      if (writes && (!FREE_WRITES.has(method) || (method === 'alerts.save' && !newAlert)))
        throw { code: 'invalid-params', message: 'main window only' } satisfies CoreError
    }
    // フリー N は自分の配置だけを書ける
    if (method === 'user.saveWindowLayout' && (msg.params as { slot?: unknown } | null)?.slot !== slot)
      throw { code: 'invalid-params', message: 'slot' } satisfies CoreError
    // ニュースのペインはフリー N に置かない。念のため、フリー N からは読むことだけ（docs/design-news.md §5）
    if (slot !== 'main' && method.startsWith('news.') && method !== 'news.list')
      throw { code: 'invalid-params', message: 'main window only' } satisfies CoreError
    // 自分の項目だけを見る（toString・constructor などの組み込みの名前を、メソッドと取り違えない）
    const schema = Object.hasOwn(PARAMS, method) ? PARAMS[method as Method] : undefined
    if (!schema) throw { code: 'unknown-method', args: { method } } satisfies CoreError
    const parsed = schema.safeParse(msg.params ?? {})
    if (!parsed.success) throw { code: 'invalid-params', message: parsed.error.issues[0]?.message } satisfies CoreError
    if (method.startsWith('news.')) {
      if (!ctx.news) throw { code: 'not-found', message: 'news' } satisfies CoreError
      return { reply: { id, result: await ctx.news.call(method as never, parsed.data, slot) } }
    }
    // このアプリの通信先（設定。既存の許可リストとニュースのオンのフィードのホスト）
    if (method === 'app.endpoints') return { reply: { id, result: { app: [...ALLOWED_HOST_NAMES], news: ctx.news?.hosts() ?? [] } } }
    const result = await service.call(method as Method, parsed.data as never)
    // 全データの削除はニュースの見出しのキャッシュも消す
    if (method === 'jobs.reset') ctx.news?.removeAll()
    const kind = Object.hasOwn(CHANGES, method) ? CHANGES[method] : undefined
    if (!kind) return { reply: { id, result } }
    const p = parsed.data as { list?: string; id?: string }
    const data: Events['user.changed'] = {
      kind,
      from: slot,
      ...(method === 'watchlists.toggleItem' ? { op: { list: String(p.list), id: String(p.id) } } : {}),
      ...(kind === 'drawings' ? { id: p.id } : {}),
    }
    return { reply: { id, result }, notice: { event: 'user.changed', data } }
  } catch (e) {
    const err = e as Partial<CoreError> & { message?: string; code?: string }
    const code = (err.code === 'read-only' ? 'read-only' : (err.code as CoreError['code'])) ?? 'internal'
    if (code === 'internal') ctx.log?.(`error ${method}: ${String(err.message ?? e)}`)
    return { reply: { id, error: { code, message: String(err.message ?? ''), ...(err.args ? { args: err.args } : {}) } as CoreError } }
  }
}
