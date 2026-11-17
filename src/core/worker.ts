// Core の入口（Electron の utilityProcess として fork される。§8.1）。
// renderer とは main が渡す MessagePort で直結する。入力はすべて zod で検証する。
import './clock-init' // テストの時刻（スタブのときだけ）を最初にそろえる
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Events } from '@shared/api'
import { jstNow } from '@shared/calendar'
import { dispatch } from './dispatch'
import { ALLOWED_HOSTS, guardFetch } from './netGuard'
import { createStubProvider } from './providers/stub'
import { createYahooProvider } from './providers/yahoo'
import { CoreService } from './service'

// 外部への通信は許可リストのホストだけ（NFR-S1。リダイレクトの行き先も確かめる。netGuard.ts）
globalThis.fetch = guardFetch(globalThis.fetch, ALLOWED_HOSTS)

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

const dispatchCtx = {
  prioritize: (slot: string, ids: string[]) => {
    shown.set(slot, ids)
    prioritizeAll()
  },
  log,
}
async function handle(slot: string, port: PortLike, msg: { id: number; method: string; params: unknown }): Promise<void> {
  const { reply, notice } = await dispatch(service, dispatchCtx, slot, msg)
  port.postMessage(reply)
  if (notice) broadcast(notice)
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
