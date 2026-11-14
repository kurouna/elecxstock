import type { EventName, Events, Method, Params, Results } from './api'

/** preload が renderer に出す唯一の口（window.elecxstock。NFR-A2） */
export interface ElecxstockBridge {
  call<M extends Method>(method: M, params: Params<M>): Promise<Results[M]>
  on<E extends EventName | 'core.ready'>(event: E, cb: (d: E extends EventName ? Events[E] : null) => void): () => void
  prioritize(ids: string[]): void
  openExternal(url: string): Promise<boolean>
  saveText(name: string, text: string): Promise<boolean>
  openFile(kind: 'json' | 'xlsx' | 'text' | 'csv'): Promise<string | Uint8Array | null>
  /** data/backups の DB のバックアップを、選んだ場所へ写す */
  exportBackup(file: string): Promise<boolean>
  openLogs(): Promise<boolean>
  /** ウィンドウの枠の色・高さをテーマと表示倍率に合わせる */
  setChrome(theme: string, scale: number): Promise<boolean>
  /** 同梱 OSS のライセンス一覧 */
  notices(): Promise<string>
  /** アプリを終える（どの窓からでも全部を閉じる） */
  quit(): Promise<boolean>
  // ---- マルチモニタ（docs/design-multimonitor.md）
  /** フリー N を開く（slot が null なら空いている番号）。shape は初期の形。開いた番号を返す */
  openWindow(slot: string | null, shape?: string): Promise<string | null>
  /** 開いているウィンドウ・いま前にある窓・自分 */
  windowInfo(): Promise<{ open: string[]; active: string; self: string | null } | null>
  /** 次・前のウィンドウへ（Ctrl+F6） */
  cycleWindow(dir: 1 | -1): Promise<string | null>
  /** このウィンドウの文字の大きさ（+1 / −1、0 で戻す） */
  zoomWindow(step: number | null): Promise<number | null>
  /** フリー N へ銘柄を送る（R4。開いていなければ開く）。送った先を返す */
  sendToFree(ids: string[]): Promise<string | null>
  /** フリー N の準備ができた（読み込み前に送られた銘柄を受け取る） */
  freeReady(): Promise<string[]>
  onReceive(cb: (ids: string[]) => void): () => void
  /** 終了の前に、遅らせている保存を終える（終えたら main に知らせる） */
  onFlush(cb: () => Promise<unknown>): () => void
  /** ウィンドウをまたぐ知らせ（R3: リンク）。main が番号を付けて配り、最後の値を覚える */
  busPublish(topic: string, data: unknown): void
  busLast(): Promise<{ topic: string; data: unknown; seq: number }[]>
  onBus(cb: (m: { topic: string; data: unknown; seq: number }) => void): () => void
  /** Windows の通知を出す（アラート。FR-AL5。1 枚目だけ）。押されたら 1 枚目を前に出して onAlertsOpen を呼ぶ */
  notify(title: string, body: string): Promise<boolean>
  onAlertsOpen(cb: () => void): () => void
  platform: string
}
