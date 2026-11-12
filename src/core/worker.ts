// Core の入口（Electron の utilityProcess として fork される。§8.1）。
// renderer とは main が渡す MessagePort で直結する。入力はすべて zod で検証する。
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { type CoreError, type Events, type Method, PARAMS } from '@shared/api'
import { createStubProvider } from './providers/stub'
import { createYahooProvider } from './providers/yahoo'
import { CoreService } from './service'

// 外部への通信は許可リストのホストだけ（NFR-S1）
const ALLOW = [/(^|\.)yahoo\.com$/, /^www\.jpx\.co\.jp$/]
const realFetch = globalThis.fetch
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.protocol !== 'https:' || !ALLOW.some((r) => r.test(url.hostname)))
    return Promise.reject(new Error(`blocked host: ${url.hostname}`))
  return realFetch(input, init)
}

const dataDir = process.env.ELECXSTOCK_DATA_DIR ?? join(process.cwd(), '.data')
mkdirSync(join(dataDir, 'logs'), { recursive: true })
const logFile = () => join(dataDir, 'logs', `core-${new Date().toISOString().slice(0, 10)}.log`)
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
  start(): void
}
let port: PortLike | null = null
const send = (msg: unknown) => port?.postMessage(msg)

const provider = process.env.ELECXSTOCK_PROVIDER === 'stub' ? createStubProvider() : createYahooProvider()
const service = new CoreService(
  dataDir,
  provider,
  <E extends keyof Events>(event: E, data: Events[E]) => send({ event, data }),
  process.env.ELECXSTOCK_VERSION ?? '0.0.0',
  log,
)
log(`core start provider=${provider.id}`)

async function handle(msg: { id: number; method: string; params: unknown }): Promise<void> {
  const { id, method } = msg
  try {
    if (method === 'jobs.prioritize') {
      service.prioritize(Array.isArray(msg.params) ? (msg.params as string[]).slice(0, 200) : [])
      return send({ id, result: null })
    }
    const schema = PARAMS[method as Method]
    if (!schema) throw { code: 'unknown-method', args: { method } } satisfies CoreError
    const parsed = schema.safeParse(msg.params ?? {})
    if (!parsed.success) throw { code: 'invalid-params', message: parsed.error.issues[0]?.message } satisfies CoreError
    const result = await service.call(method as Method, parsed.data as never)
    send({ id, result })
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
  if (d?.type === 'port' && e.ports[0]) {
    port = e.ports[0]
    port.on('message', (m) => void handle(m.data as { id: number; method: string; params: unknown }))
    port.start()
  }
})
service.start()
// 準備ができたことを main に知らせる（main はこれを待ってから renderer とのポートを渡す）
parentPort.postMessage({ type: 'ready' })

process.on('uncaughtException', (e) => log(`uncaught ${e.stack ?? e}`))
process.on('unhandledRejection', (e) => log(`unhandled ${String(e)}`))
