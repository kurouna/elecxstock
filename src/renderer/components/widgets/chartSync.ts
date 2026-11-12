// 同じリンク色のチャート間で十字線を合わせるための登録表（FR-K3）
import type { Bars } from '@shared/types'
import type { PaneNode } from '../../stores/layout.svelte'

export interface ChartHandle {
  pane: PaneNode
  sync: boolean
  bars: () => Bars | null
  show: (time: string | null) => void
}
export const charts = new Set<ChartHandle>()
