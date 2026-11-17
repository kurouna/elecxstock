// 窓ごとの描画のストア（docs/design-drawings.md §7.3）。同じ窓のチャート・MTF の段・グリッドのタイルがここから読む。
// ほかの窓の変更は Core の user.changed（kind: drawings）で読み直す。書くのは edits.ts（手元を先に変え、まとめて書く）
import type { Drawing } from '@shared/drawings'
import { bridge, t, toast } from '../../stores/app.svelte'
import { SLOT } from '../windowSlot'
import { DrawingEdits } from './edits'

class DrawingsState {
  /** 銘柄 → 図形（中身は Core の値。置き換えるだけで、直に書き換えない） */
  by = $state.raw<Record<string, Drawing[]>>({})
  /** 変わるたびに増える（グリッドのタイルが描き直す） */
  rev = $state(0)
}
export const drawingsState = new DrawingsState()

const store = {
  list: (id: string) => drawingsState.by[id] ?? [],
  put: (id: string, list: Drawing[]) => {
    const next = { ...drawingsState.by }
    if (list.length) next[id] = list
    else delete next[id]
    drawingsState.by = next
    drawingsState.rev++
  },
}
// 呼び出しは bridge で（rpc は失敗をトーストで知らせるので、ここでまとめて知らせる）
export const drawingEdits = new DrawingEdits(
  {
    create: (id, d) => bridge.call('drawings.create', { id, drawing: d }),
    update: (id, d, expected) => bridge.call('drawings.update', { id, drawing: d, expected }),
    remove: (id, drawingId, expected) => bridge.call('drawings.remove', { id, drawingId, expected }),
    clear: (id) => bridge.call('drawings.clear', { id }),
  },
  store,
  (n) => toast(t(n === 'conflict' ? 'draw.conflict' : 'draw.failed'), undefined, 4000, n === 'conflict' ? 'info' : 'error'),
)

let started = false
async function reload(only?: string): Promise<void> {
  const all = await bridge.call('drawings.all', {}).catch(() => null)
  if (!all) return
  const ids = only ? [only] : [...new Set([...Object.keys(all), ...Object.keys(drawingsState.by)])]
  for (const id of ids) drawingEdits.merge(id, all[id] ?? [])
}
/** 初めて使うときに読み、ほかの窓の変更を受ける（チャートが開いたときに呼ぶ。何度呼んでもよい） */
export function ensureDrawings(): void {
  if (started) return
  started = true
  void reload()
  // 窓を閉じる前に、書いていない変更を書く（届けば残る。best effort）
  window.addEventListener('beforeunload', () => void drawingEdits.flush())
  bridge.on('user.changed', (d) => {
    // 取り込み・元に戻すは自分の窓でも読み直す。描画の変更は、ほかの窓のものだけ（自分のものは手元に入っている）
    if (d.kind === 'all') void reload()
    else if (d.kind === 'drawings' && d.from !== SLOT) void reload(d.id)
  })
}
export const drawingsOf = (id: string): readonly Drawing[] => drawingsState.by[id] ?? []
