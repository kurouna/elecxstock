import type { EventName, Events, Method, Params, Results } from './api'
import type { LoginState } from './background'

/** preload が renderer に出す唯一の口（window.elecxstock。NFR-A2） */
export interface ElecxstockBridge {
  call<M extends Method>(method: M, params: Params<M>): Promise<Results[M]>
  on<E extends EventName | 'core.ready'>(event: E, cb: (d: E extends EventName ? Events[E] : null) => void): () => void
  prioritize(ids: string[]): void
  /** テストの時刻のずれ（ms。ELECXSTOCK_NOW のスタブのときだけ）。renderer の入口で Date をずらす */
  clockOffset?: number
  /** 起動の最初のテーマ（保存した設定から main が読む）。renderer の入口で html に当て、最初の描画からその色にする */
  initialTheme?: 'light' | 'dark'
  openExternal(url: string): Promise<boolean>
  /** 文字をクリップボードへ（ニュースの見出しのコピー。docs/design-news.md §7.4） */
  copyText(text: string): Promise<boolean>
  saveText(name: string, text: string): Promise<boolean>
  /** チャートの画像（PNG のバイト列）を保存ダイアログで選んだ場所へ書く（FR-C11） */
  savePng(name: string, bytes: Uint8Array): Promise<boolean>
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
  /** このウィンドウの全画面を切り替える（F11）。切り替えたあとの状態 */
  toggleFullscreen(): Promise<boolean | null>
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
  // ---- 常駐と自動起動（docs/design-background.md）
  /** サインイン時の起動の状態（正は Windows の登録。毎回読む） */
  loginItem(): Promise<LoginState | null>
  /** サインイン時の起動を登録・解除する（hidden は通知領域に入れておく）。登録したあとの状態を返す */
  setLoginItem(on: boolean, hidden: boolean): Promise<LoginState | null>
  /** トレイのメニューの「設定」（1 枚目に届く） */
  onOpenSettings(cb: () => void): () => void
  platform: string
}
