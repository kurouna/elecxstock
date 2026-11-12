import type { EventName, Events, Method, Params, Results } from './api'

/** preload が renderer に出す唯一の口（window.elecxstock。NFR-A2） */
export interface ElecxstockBridge {
  call<M extends Method>(method: M, params: Params<M>): Promise<Results[M]>
  on<E extends EventName | 'core.ready'>(event: E, cb: (d: E extends EventName ? Events[E] : null) => void): () => void
  prioritize(ids: string[]): void
  openExternal(url: string): Promise<boolean>
  saveText(name: string, text: string): Promise<boolean>
  openFile(kind: 'json' | 'xlsx'): Promise<string | Uint8Array | null>
  platform: string
}
