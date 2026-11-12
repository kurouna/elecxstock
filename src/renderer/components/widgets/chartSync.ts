// 同じリンク色のチャート間で十字線・表示期間を合わせるための登録表（FR-K3, K4）
import type { Bars, Timeframe } from '@shared/types'
import type { PaneNode } from '../../stores/layout.svelte'

export interface ChartHandle {
  readonly pane: PaneNode
  sync: boolean
  tf: () => Timeframe
  bars: () => Bars | null
  show: (time: string | null) => void
  /** 表示期間を合わせる（そろえる設定のチャートだけが受ける） */
  range: (from: string, to: string) => void
}
export const charts = new Set<ChartHandle>()
