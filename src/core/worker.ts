// Core の入口（Electron の utilityProcess として fork される。§8.1）。
// renderer とは main が渡す MessagePort で直結する。入力はすべて zod で検証する。
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { type CoreError, type Events, type Method, PARAMS } from '@shared/api'
import { jstNow } from '@shared/calendar'
import { CHANGES } from './changes'
import { createStubProvider } from './providers/stub'
import { createYahooProvider } from './providers/yahoo'
import { CoreService } from './service'

// 外部への通信は許可リストのホストだけ（NFR-S1）
// api.github.com は新しい版の確認だけ（NFR-Q9。設定で切れる）
const ALLOW = [/(^|\.)yahoo\.com$/, /^www\.jpx\.co\.jp$/, /^api\.github\.com$/]
const realFetch = globalThis.fetch
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.protocol !== 'https:' || !ALLOW.some((r) => r.test(url.hostname)))
    return Promise.reject(new Error(`blocked host: ${url.hostname}`))
  return realFetch(input, init)
}

const dataDir = process.env.ELECXSTOCK_DATA_DIR ?? join(process.cwd(), '.data')
mkdirSync(join(dataDir, 'logs'), { recursive: true })
const logFile = () => join(dataDir, 'logs', `core-${jstNow().date}.log`)
const log = (msg: string) => {
  try {
    appendFileSync(logFile(), `${new Date().toISOString()} ${msg}\n`) // 日付ごとのファイル（NFR-O1）
  } catch {
    /* ignore */
  }
}

interface PortLike {
  postMessage(msg: unknown): void
  on(ev: 'message', f: (e: { data: unknown }) => void): void
  on(ev: 'close', f: () => void): void
  start(): void
  close?(): void
}
/** ウィンドウ（スロット）ごとのポート（マルチモニタ）。返事は来たポートへ、イベントは全部へ */
const ports = new Map<string, PortLike>()
const broadcast = (msg: unknown) => {
  for (const p of ports.values()) p.postMessage(msg)
}
/** 表示中の銘柄（FR-F8）はウィンドウごとに受け、和集合で使う */
const shown = new Map<string, string[]>()
const prioritizeAll = () => service.prioritize([...new Set([...shown.values()].flat())].slice(0, 400))

const provider = process.env.ELECXSTOCK_PROVIDER === 'stub' ? createStubProvider() : createYahooProvider()
const service = new CoreService(
  dataDir,
  provider,
  <E extends keyof Events>(event: E, data: Events[E]) => broadcast({ event, data }),
  process.env.ELECXSTOCK_VERSION ?? '0.0.0',
  log,
)
log(`core start provider=${provider.id}`)

async function handle(slot: string, port: PortLike, msg: { id: number; method: string; params: unknown }): Promise<void> {
  const { id, method } = msg
  const send = (m: unknown) => port.postMessage(m)
  try {
    if (method === 'jobs.prioritize') {
      const ids = Array.isArray(msg.params)
        ? msg.params.filter((x): x is string => typeof x === 'string' && x.length <= 24).slice(0, 200)
        : []
      shown.set(slot, ids)
      prioritizeAll()
      return send({ id, result: null })
    }
    // フリー N は自分の配置だけを書ける
    if (method === 'user.saveWindowLayout' && (msg.params as { slot?: unknown } | null)?.slot !== slot)
      throw { code: 'invalid-params', message: 'slot' } satisfies CoreError
    const schema = PARAMS[method as Method]
    if (!schema) throw { code: 'unknown-method', args: { method } } satisfies CoreError
    const parsed = schema.safeParse(msg.params ?? {})
    if (!parsed.success) throw { code: 'invalid-params', message: parsed.error.issues[0]?.message } satisfies CoreError
    const result = await service.call(method as Method, parsed.data as never)
    send({ id, result })
    const kind = CHANGES[method]
    if (kind) {
      const p = parsed.data as { list?: string; id?: string }
      broadcast({
        event: 'user.changed',
        data: { kind, from: slot, ...(method === 'watchlists.toggleItem' ? { op: { list: p.list, id: p.id } } : {}) },
      })
    }
  } catch (e) {
    const err = e as Partial<CoreError> & { message?: string; code?: string }
    const code = (err.code === 'read-only' ? 'read-only' : (err.code as CoreError['code'])) ?? 'internal'
    if (code === 'internal') log(`error ${method}: ${String(err.message ?? e)}`)
    send({ id, error: { code, message: String(err.message ?? ''), ...(err.args ? { args: err.args } : {}) } })
  }
}

// Electron の utilityProcess が用意する親とのポート（型は Electron に依存しないようここで書く）
interface ParentPort {
  on(ev: 'message', f: (e: { data: unknown; ports: PortLike[] }) => void): void
  postMessage(m: unknown): void
}
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort
parentPort.on('message', (e) => {
  const d = e.data as { type?: string }
  if (d?.type === 'shutdown') {
    // 閉じる直前に renderer が送った保存（レイアウト・ウォッチリスト）を先に処理してから止める
    setTimeout(() => {
      void service
        .shutdown()
        .catch((err) => log(`shutdown ${String(err)}`))
        .finally(() => {
          log('core shutdown')
          process.exit(0)
        })
    }, 150)
    return
  }
  if (d?.type === 'port' && e.ports[0]) {
    // 同じウィンドウが読み込み直したら、古いポートを閉じて置き換える
    const slot = typeof (d as { slot?: unknown }).slot === 'string' ? (d as { slot: string }).slot : 'main'
    const port = e.ports[0]
    ports.get(slot)?.close?.()
    ports.set(slot, port)
    shown.delete(slot)
    port.on('message', (m) => void handle(slot, port, m.data as { id: number; method: string; params: unknown }))
    // 窓が閉じたら、その窓の表示中の銘柄と送り先を外す
    port.on('close', () => {
      if (ports.get(slot) !== port) return
      ports.delete(slot)
      shown.delete(slot)
      prioritizeAll()
    })
    port.start()
  }
})
service.start()
// 準備ができたことを main に知らせる（main はこれを待ってから renderer とのポートを渡す）
parentPort.postMessage({ type: 'ready' })

process.on('uncaughtException', (e) => log(`uncaught ${e.stack ?? e}`))
process.on('unhandledRejection', (e) => log(`unhandled ${String(e)}`))
