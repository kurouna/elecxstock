<script lang="ts">
// ヒートマップのペイン（heatmap）の表示の切り替え（docs/design-quote-board.md §6・FR-QB1）。
// qbView でヒートマップ（Heatmap.svelte）か株価ボード（QuoteBoard.svelte）の一方だけを描く。描いていない方はマウントされないので、
// キー処理（registerPane）・取得・ResizeObserver も一方だけが動く。どちらもこのファイル・lib/paneView.ts を知らない
// （V キーの包み wrapApi・見出しの先頭の切り替えのボタン lead・「⋯」のメニュー more を props で渡す）
import { onDestroy } from 'svelte'
import { type PaneApi, registerPane } from '../../lib/panes'
import { otherView, type ViewId, withViewSwitch } from '../../lib/paneView'
import { readQbState } from '../../lib/quoteBoard'
import { t, toast } from '../../stores/app.svelte'
import { type PaneNode, patchState } from '../../stores/layout.svelte'
import ViewSwitch from '../ViewSwitch.svelte'
import Heatmap from './Heatmap.svelte'
import QuoteBoard from './QuoteBoard.svelte'

let { pane }: { pane: PaneNode } = $props()
const view = $derived(readQbState(pane.state).view)
const setView = (v: ViewId) => {
  if (readQbState(pane.state).view !== v) patchState(pane, { qbView: v })
}
const toggle = () => setView(otherView(readQbState(pane.state).view))
const wrapApi = (api: PaneApi): PaneApi => withViewSwitch(api, toggle)
const more = () => [{ id: 'view', label: t('qb.toView', { name: t(`qb.view.${otherView(view)}`) }), hint: 'V', run: toggle }]

// 株価ボードで例外が起きたら、ペインごと止めずにヒートマップへ戻せるようにする（qbView が保存されていても戻れなくならない）
let broken = $state(false)
function onerror(e: unknown) {
  broken = true
  toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), undefined, 5000)
}
$effect(() => {
  if (view !== 'board') broken = false
})
// 壊れている間は、株価ボードのキー処理が外れているので、V（ヒートマップへ戻す）だけを受ける
let offBroken: (() => void) | null = null
$effect(() => {
  offBroken?.()
  offBroken =
    broken && view === 'board'
      ? registerPane(
          pane.id,
          withViewSwitch({}, () => setView('map')),
        )
      : null
})
onDestroy(() => offBroken?.())
</script>

{#snippet lead()}<ViewSwitch {view} onpick={setView} />{/snippet}

{#if view === 'board'}
  <svelte:boundary {onerror}>
    <QuoteBoard {pane} {wrapApi} {lead} {more} />
    {#snippet failed()}
      <div class="failed" role="alert">
        <p>{t('qb.failed')}</p>
        <button type="button" class="chip" onclick={() => setView('map')}>{t('qb.backToMap')}</button>
      </div>
    {/snippet}
  </svelte:boundary>
{:else}
  <Heatmap {pane} {wrapApi} {lead} {more} />
{/if}

<style>
  .failed {
    flex: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--s-2);
    color: var(--text-2);
    padding: var(--s-4);
    text-align: center;
  }
</style>
