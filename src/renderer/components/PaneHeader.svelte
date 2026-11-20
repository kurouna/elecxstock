<script lang="ts" module>
/** 「⋯」のメニューに足す、ペインの種類ごとの項目（狭いときに見出しから隠れる操作） */
export type MoreItem = { id: string; label: string; hint?: string; run: () => void }
</script>

<script lang="ts">
// ペインの見出し（FR-V5）: リンク色の印・種類・主要な値。操作ボタンはポインタを載せたときかフォーカス中に出す。
// 幅が足りないときは中身（children）の側を切り、閉じるボタンは必ず残す。狭いペインでは操作ボタンを「⋯」にまとめる
import type { Snippet } from 'svelte'
import { allowedHere, keyOf, runAction, setFocus } from '../lib/commands'
import type { Key } from '../lib/i18n'
import { confirmCloseScreen } from '../lib/screens'
import { app, choiceDialog, t } from '../stores/app.svelte'
import { closePane, inDock, type PaneNode } from '../stores/layout.svelte'
import { DRAG_MIME } from './dragPane'

let {
  pane,
  children,
  more,
  title,
  collapse = 400,
}: {
  pane: PaneNode
  children?: Snippet
  more?: () => MoreItem[]
  /** 見出しの名前（省略すればペインの種類の名前。ヒートマップのペインの株価ボードの表示など、表示で名前が変わるペインが渡す） */
  title?: string
  /** ペインの幅がこれ未満になったら操作ボタンを「⋯」にまとめる（中身が多いペインほど大きく） */
  collapse?: 820 | 600 | 400
} = $props()
const PANE_OPS = ['split', 'splitDown', 'changeWidget', 'toDrawer', 'max'] as const
/** 「⋯」: 隠れた操作とペインの操作を選ぶ */
async function openMore() {
  setFocus(pane.id)
  const extra = more?.() ?? []
  // フリー N はドロワーを持たない（FR-L7）。使えない操作は出さない
  const ops = PANE_OPS.filter(allowedHere).map((id) => ({ id: `op:${id}`, label: t(`act.${id}` as Key), ...(id === 'toDrawer' ? {} : { hint: keyOf(id) }) }))
  const c = await choiceDialog(t('act.more'), [...extra.map(({ id, label, hint }) => ({ id: `x:${id}`, label, ...(hint ? { hint } : {}) })), ...ops])
  if (!c) return
  if (c.startsWith('op:')) act(c.slice(3))
  else extra.find((x) => `x:${x.id}` === c)?.run()
}
const focused = $derived(app.focus === pane.id)
/** このペインにフォーカスを移してからアクションを実行する（見出しのボタン） */
function act(id: string) {
  setFocus(pane.id)
  runAction(id)
}
</script>

<!-- タイトルをドラッグして別のペインの上下左右に落とすと移動、真ん中で入れ替え（FR-L2。キーは Ctrl+Alt+Shift+矢印） -->
<div
  class={`ph c${collapse}`}
  class:focused
  draggable="true"
  role="toolbar"
  tabindex="-1"
  ondragstart={(e) => {
    e.dataTransfer?.setData(DRAG_MIME, pane.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    document.body.classList.add('dragging-pane')
  }}
  ondragend={() => document.body.classList.remove('dragging-pane')}
>
  <span class={`link l${pane.link}`} title={`${t('link.set', { n: pane.link || '—' })} (Ctrl+${pane.link})`}>{pane.link || '·'}</span>
  <span class="body">
    {#if !inDock(pane.id)}<span class="title">{title ?? t(`widget.${pane.widget}` as Key)}</span>{/if}
    {#if children}{@render children()}{/if}
  </span>
  {#if inDock(pane.id)}
    <span class="tools">
      <button type="button" title={t('act.fromDrawer')} aria-label={t('act.fromDrawer')} onclick={() => act('fromDrawer')}>⇲</button>
    </span>
  {:else}
    <span class="tools">
      <!-- ドロワーへ移すと、帯にポインタを載せたときだけ出る（自動で隠れる・ピン留めできる。FR-DR3） -->
      <button type="button" class="more" title={t('act.more')} aria-label={t('act.more')} onclick={openMore}>⋯</button>
      <button type="button" class="op" title={`${t('act.split')} (${keyOf('split')})`} aria-label={t('act.split')} onclick={() => act('split')}>◫</button>
      <button type="button" class="op" title={`${t('act.splitDown')} (${keyOf('splitDown')})`} aria-label={t('act.splitDown')} onclick={() => act('splitDown')}>⊟</button>
      <button type="button" class="op" title={`${t('act.changeWidget')} (${keyOf('changeWidget')})`} aria-label={t('act.changeWidget')} onclick={() => act('changeWidget')}>▾</button>
      {#if allowedHere('toDrawer')}<button type="button" class="op" title={t('act.toDrawer')} aria-label={t('act.toDrawer')} onclick={() => act('toDrawer')}>⇤</button>{/if}
      <button type="button" class="op" title={`${t('act.max')} (${keyOf('max')})`} aria-label={t('act.max')} onclick={() => act('max')}>⤢</button>
      <button type="button" title={`${t('act.close')} (${keyOf('close')})`} aria-label={t('act.close')} onclick={async () => { if (await confirmCloseScreen(pane)) closePane(pane.id) }}>✕</button>
    </span>
  {/if}
</div>

<style>
  .ph {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 28px;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--line);
    border-top: 2px solid transparent;
    background: var(--panel);
    flex: none;
    min-width: 0;
    white-space: nowrap;
  }
  .ph.focused {
    border-top-color: var(--focus);
    background: var(--panel-2);
  }
  .title {
    font-size: var(--fs-2);
    font-weight: 600;
    color: var(--text-3);
    flex: none;
  }
  .ph.focused .title {
    color: var(--text);
  }
  /* 中身。足りない分はここで切る（閉じるボタンを押し出さない） */
  .body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    overflow: hidden;
  }
  .tools {
    flex: none;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--motion);
  }
  :global(.pane:hover) .tools,
  .ph.focused .tools {
    opacity: 1;
  }
  .tools button {
    background: none;
    border: 1px solid transparent;
    color: var(--text-3);
    height: 18px;
    padding: 0 6px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: var(--fs-1);
  }
  .tools button:hover {
    border-color: var(--line-strong);
    color: var(--text);
  }
  .more {
    display: none;
  }
  /* 操作ボタンをまとめる幅（collapse）。チャートは中身が多いので早めにまとめる */
  @container (max-width: 819px) {
    .c820 .tools .op {
      display: none;
    }
    .c820 .tools .more {
      display: block;
    }
    .c820 .title {
      display: none;
    }
  }
  @container (max-width: 599px) {
    .c600 .tools .op {
      display: none;
    }
    .c600 .tools .more {
      display: block;
    }
  }
  @container (max-width: 399px) {
    .c400 .tools .op {
      display: none;
    }
    .c400 .tools .more {
      display: block;
    }
  }
  @container (max-width: 520px) {
    .title {
      display: none;
    }
  }
</style>
