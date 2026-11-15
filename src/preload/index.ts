// preload: renderer に出すのは window.elecxstock だけ（NFR-A2）。Core とは main から受け取った MessagePort で話す。

import type { CoreError, EventName, Events, Method, Params, Results } from '@shared/api'
import type { ElecxstockBridge } from '@shared/bridge'
import { contextBridge, ipcRenderer } from 'electron'

let port: MessagePort | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; method: string }>()
const queue: { id: number; method: string; params: unknown }[] = []
const listeners = new Map<string, Set<(d: unknown) => void>>()

ipcRenderer.on('core-port', (e) => {
  const p = e.ports[0]
  if (!p) return
  // Core が立ち上げ直されたら、待っている要求はやり直してもらう
  for (const [id, w] of [...pending]) {
    if (queue.some((q) => q.id === id)) continue // まだ送っていない要求は新しいポートで送る
    w.reject({ code: 'busy', message: 'core restarted' } satisfies CoreError)
    pending.delete(id)
  }
  port = p
  port.onmessage = (ev: MessageEvent) => {
    const m = ev.data as { id?: number; result?: unknown; error?: CoreError; event?: string; data?: unknown }
    if (m.event) {
      for (const f of listeners.get(m.event) ?? []) f(m.data)
      return
    }
    const w = m.id != null ? pending.get(m.id) : undefined
    if (!w) return
    pending.delete(m.id!)
    if (m.error) w.reject(m.error)
    else w.resolve(m.result)
  }
  port.start()
  for (const f of listeners.get('core.ready') ?? []) f(null)
  for (const q of queue.splice(0)) port.postMessage(q)
})

const api: ElecxstockBridge = {
  call<M extends Method>(method: M, params: Params<M>): Promise<Results[M]> {
    const id = ++seq
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, method })
      const msg = { id, method, params }
      if (port) port.postMessage(msg)
      else queue.push(msg)
    })
  },
  on<E extends EventName | 'core.ready'>(event: E, cb: (d: E extends EventName ? Events[E] : null) => void): () => void {
    let set = listeners.get(event)
    if (!set) {
      set = new Set()
      listeners.set(event, set)
    }
    set.add(cb as (d: unknown) => void)
    return () => set!.delete(cb as (d: unknown) => void)
  },
  /** 表示中の銘柄を先に取得してもらう（FR-F8） */
  prioritize(ids: string[]): void {
    const msg = { id: ++seq, method: 'jobs.prioritize', params: ids.slice(0, 200) }
    if (port) port.postMessage(msg)
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url) as Promise<boolean>,
  saveText: (name: string, text: string) => ipcRenderer.invoke('app:saveText', name, text) as Promise<boolean>,
  notices: () => ipcRenderer.invoke('app:notices') as Promise<string>,
  openFile: (kind: 'json' | 'xlsx' | 'text' | 'csv') => ipcRenderer.invoke('app:openFile', kind) as Promise<string | Uint8Array | null>,
  exportBackup: (file: string) => ipcRenderer.invoke('app:exportBackup', file) as Promise<boolean>,
  openLogs: () => ipcRenderer.invoke('app:openLogs') as Promise<boolean>,
  setChrome: (theme: string, scale: number) => ipcRenderer.invoke('app:setChrome', theme, scale) as Promise<boolean>,
  quit: () => ipcRenderer.invoke('app:quit') as Promise<boolean>,
  // マルチモニタ（docs/design-multimonitor.md）
  openWindow: (slot: string | null, shape?: string) => ipcRenderer.invoke('win:open', slot, shape) as Promise<string | null>,
  windowInfo: () => ipcRenderer.invoke('win:info') as Promise<{ open: string[]; active: string; self: string | null } | null>,
  cycleWindow: (dir: 1 | -1) => ipcRenderer.invoke('win:cycle', dir) as Promise<string | null>,
  zoomWindow: (step: number | null) => ipcRenderer.invoke('win:zoom', step) as Promise<number | null>,
  sendToFree: (ids: string[]) => ipcRenderer.invoke('win:send', ids) as Promise<string | null>,
  freeReady: () => ipcRenderer.invoke('win:ready') as Promise<string[]>,
  onReceive: (cb: (ids: string[]) => void) => {
    const f = (_e: unknown, ids: string[]) => cb(ids)
    ipcRenderer.on('win:receive', f)
    return () => void ipcRenderer.off('win:receive', f)
  },
  /** 終了の前に main が頼む: 遅らせている保存を終えたら知らせる */
  onFlush: (cb: () => Promise<unknown>) => {
    const f = (_e: unknown, id: number) => void cb().finally(() => ipcRenderer.send('app:flushed', id))
    ipcRenderer.on('app:flush', f)
    return () => void ipcRenderer.off('app:flush', f)
  },
  busPublish: (topic: string, data: unknown) => ipcRenderer.send('bus:publish', topic, data),
  busLast: () => ipcRenderer.invoke('bus:last') as Promise<{ topic: string; data: unknown; seq: number }[]>,
  onBus: (cb: (m: { topic: string; data: unknown; seq: number }) => void) => {
    const f = (_e: unknown, m: { topic: string; data: unknown; seq: number }) => cb(m)
    ipcRenderer.on('bus', f)
    return () => void ipcRenderer.off('bus', f)
  },
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body) as Promise<boolean>,
  onAlertsOpen: (cb: () => void) => {
    const f = () => cb()
    ipcRenderer.on('alerts:open', f)
    return () => void ipcRenderer.off('alerts:open', f)
  },
  platform: process.platform,
  // 起動の最初のテーマ（main が保存した設定から読んで渡す。renderer が最初に描く前に当てる）
  initialTheme: process.argv.includes('--elecxstock-theme=light') ? 'light' : 'dark',
  // テストの時刻（main が ELECXSTOCK_NOW のときだけ渡す）
  clockOffset:
    Number(process.argv.find((a) => a.startsWith('--elecxstock-clock-offset='))?.slice('--elecxstock-clock-offset='.length)) || undefined,
}
contextBridge.exposeInMainWorld('elecxstock', api)
