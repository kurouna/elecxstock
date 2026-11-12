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
  columns?: () => { ids: InstrumentId[]; cols: ListCol[]; name: string }
  /** コマンドバーから呼ぶ、ペインごとの操作（例: 'duplicate'・'columns'）。扱えたら true */
  run?: (action: string) => boolean
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
