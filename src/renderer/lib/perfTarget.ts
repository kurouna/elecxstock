// パフォーマンス比較の「足す先」（銘柄ジャンプ・コマンドバーの Ctrl+Enter。docs/design-perf.md §5.1）と、ペインの状態を書くときのきまり
import type { InstrumentId } from '@shared/types'
import { nameOf, t, toast } from '../stores/app.svelte'
import { type PaneNode, patchState } from '../stores/layout.svelte'
import type { AddTarget } from './panes'
import { addPatch, PF_MAX, pfView } from './perf'

/**
 * ペインの状態を書く。銘柄がまだ未設定（作ったときの種を読んでいるだけ）なら、種も一緒に書く
 * （開いただけでは書かない。利用者が触ったときに初めて書く。§6）
 */
export function writePerf(pane: PaneNode, seed: InstrumentId | null, patch: Record<string, unknown>): void {
  if (pane.state.pfIds === undefined && !('pfIds' in patch)) {
    const v = pfView(pane.state, seed)
    patch = { pfIds: v.ids, pfSlots: v.slots, ...patch }
  }
  patchState(pane, patch)
}
/** 足す先（5 銘柄で full。比べる相手（TOPIX・東証REIT の連動 ETF） は色の枠を使わないので満杯でも足せる） */
export function perfTarget(pane: PaneNode, seed: InstrumentId | null): AddTarget {
  const v = pfView(pane.state, seed)
  return {
    label: t('widget.perf'),
    title: t('pf.addTo'),
    primary: true,
    full: v.ids.length >= PF_MAX,
    fullTitle: t('pf.fullHint'),
    add: (id) => {
      const r = addPatch(pfView(pane.state, seed), id)
      if ('refused' in r) {
        toast(r.refused === 'full' ? t('pf.full') : t('pf.dup', { name: nameOf(id) }))
        return false
      }
      writePerf(pane, seed, r.patch)
      toast(t('pf.added', { name: nameOf(id) }))
      return true
    },
  }
}
