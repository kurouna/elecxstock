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
  openFile: (kind: 'json' | 'xlsx' | 'text') => ipcRenderer.invoke('app:openFile', kind) as Promise<string | Uint8Array | null>,
  exportBackup: (file: string) => ipcRenderer.invoke('app:exportBackup', file) as Promise<boolean>,
  openLogs: () => ipcRenderer.invoke('app:openLogs') as Promise<boolean>,
  platform: process.platform,
}
contextBridge.exposeInMainWorld('elecxstock', api)
