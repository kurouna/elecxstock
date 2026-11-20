// ペインごとのキー操作の窓口。ウィジェットは自分のキー処理と「今選んでいる銘柄」を登録する。
import type { InstrumentId } from '@shared/types'
import type { ListCol } from './columns'

export interface PaneApi {
  key?: (e: KeyboardEvent) => boolean
  current?: () => InstrumentId | null | undefined
  /** 銘柄ジャンプ・コマンドバーで選んだ銘柄を受け取る（chart-grid は自分の銘柄に足す。FR-G10） */
  receive?: (id: InstrumentId) => boolean
  selected?: () => InstrumentId[]
  /** 一覧のペイン: 今の行と列（CSV の書き出し・取り直しに使う） */
  /** 一覧の中身（CSV の書き出し・一覧の取り直し）。一覧でない表示のときは null */
  columns?: () => { ids: InstrumentId[]; cols: ListCol[]; name: string } | null
  /** コマンドバーから呼ぶ、ペインごとの操作（例: 'duplicate'・'columns'）。扱えたら true */
  run?: (action: string) => boolean
  /** run で受ける操作（コマンドバーが「今使えない」を判定する。run と一緒に書く） */
  runs?: readonly string[]
  /** ペインの中の取り消し・やり直し（チャートの描画。Ctrl+Z / Ctrl+Y）。戻すものが無ければ false（全体の取り消しに回す） */
  undo?: (redo: boolean) => boolean
}
const apis = new Map<string, PaneApi>()
export function registerPane(id: string, api: PaneApi): () => void {
  apis.set(id, api)
  return () => {
    if (apis.get(id) === api) apis.delete(id)
  }
}
export function paneApi(id: string | null | undefined): PaneApi | undefined {
  return id ? apis.get(id) : undefined
}

/** ペインの要素を引くセレクタ。ID はディスクから読んだレイアウトの文字列なので、" や \ を逃がす（壊れたセレクタで querySelector が投げない） */
export function paneSelector(id: string): string {
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')
  return `[data-pane-id="${esc}"]`
}
