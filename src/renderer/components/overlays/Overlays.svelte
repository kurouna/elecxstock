<script lang="ts">
import { refocusPane } from '../../lib/commands'
import { trapTab } from '../../lib/focusTrap'
import { app, closeOverlay } from '../../stores/app.svelte'
import AlertForm from './AlertForm.svelte'
import AlertsPopup from './AlertsPopup.svelte'
import Dialogs from './Dialogs.svelte'
import FieldPicker from './FieldPicker.svelte'
import FirstRun from './FirstRun.svelte'
import Help from './Help.svelte'
import HoldingForm from './HoldingForm.svelte'
import Jump from './Jump.svelte'
import PageMenu from './PageMenu.svelte'
import Palette from './Palette.svelte'
import ScreensList from './ScreensList.svelte'
import Settings from './Settings.svelte'
import WidgetPicker from './WidgetPicker.svelte'

// 閉じたら、フォーカスしていたペインへ戻す（閉じた要素に残すと Tab・枠の表示が迷子になる。FR-KB2, KB3）。続けて別のダイアログが開くときは戻さない
let shown = false
$effect(() => {
  const on = !!app.overlay
  if (shown && !on) refocusPane()
  shown = on
})
function backdrop(e: MouseEvent) {
  if (e.target === e.currentTarget && app.overlay?.kind !== 'firstrun') closeOverlay()
}
</script>

{#if app.overlay}
  {#if app.overlay.kind === 'jump'}
    <!-- 銘柄ジャンプはキーをすべて窓の capture で受ける（Tab も止める）ので、折り返しは要らない -->
    <Jump first={app.overlay.first} />
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <!-- マイレイアウトのメニューはタブの下に出すので、画面を暗くしない -->
    <div class="scrim" class:menu={app.overlay.kind === 'pageMenu'} onmousedown={backdrop} onkeydown={(e) => trapTab(e, e.currentTarget as HTMLElement)}>
      {#if app.overlay.kind === 'palette'}
        <Palette q={app.overlay.q ?? ''} title={app.overlay.title} />
      {:else if app.overlay.kind === 'help'}
        <Help q={app.overlay.q ?? ''} />
      {:else if app.overlay.kind === 'settings'}
        <Settings tab={app.overlay.tab ?? 'general'} />
      {:else if app.overlay.kind === 'screens'}
        <ScreensList />
      {:else if app.overlay.kind === 'pageMenu'}
        <PageMenu />
      {:else if app.overlay.kind === 'widgetPicker'}
        {#key app.overlay}
          <WidgetPicker overlay={app.overlay} />
        {/key}
      {:else if app.overlay.kind === 'firstrun'}
        <FirstRun />
      {:else if app.overlay.kind === 'holding'}
        <HoldingForm holding={app.overlay.holding} resolve={app.overlay.resolve} />
      {:else if app.overlay.kind === 'alerts'}
        <AlertsPopup tab={app.overlay.tab} />
      {:else if app.overlay.kind === 'fieldPicker'}
        {#key app.overlay}
          <FieldPicker title={app.overlay.title} fields={app.overlay.fields} used={app.overlay.used} onAdd={app.overlay.onAdd} resolve={app.overlay.resolve} />
        {/key}
      {:else if app.overlay.kind === 'alertForm'}
        {#key app.overlay}
          <AlertForm edit={app.overlay.edit} symbol={app.overlay.symbol} screenId={app.overlay.screenId} resolve={app.overlay.resolve} />
        {/key}
      {:else}
        <!-- ダイアログが続けて開いても、選択の位置などを前のものから持ち越さない -->
        {#key app.overlay}
          <Dialogs overlay={app.overlay} />
        {/key}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 50;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 72px;
  }
  .scrim.menu {
    background: transparent;
    -webkit-app-region: no-drag;
  }
  :global(.dialog) {
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    border-radius: var(--radius);
    color: var(--text);
    max-height: calc(100vh - 120px);
    /* 幅を決めたダイアログも、狭い窓・大きい文字（ルートの zoom）で左右が見切れないよう、背景の幅に収める（% は zoom の掛からない CSS の px） */
    max-width: calc(100% - 32px);
    overflow: auto;
  }
  :global(.dialog h3) {
    margin: 0 0 var(--s-2);
    font-size: var(--fs-3);
  }
  :global(.dialog .actions) {
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
    margin-top: var(--s-3);
  }
  :global(.dialog .list .grp) {
    padding: 6px 12px 2px;
    font-size: var(--fs-1);
    color: var(--text-3);
    letter-spacing: 0.08em;
  }
  :global(.dialog .list .it) {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 28px;
    padding: 0 12px;
    cursor: pointer;
    width: 100%;
    background: none;
    border: 0;
    text-align: left;
  }
  :global(.dialog .list .it.sel) {
    background: var(--select-strong);
    box-shadow: inset var(--sel-bar) 0 0 var(--focus);
  }
  :global(.dialog .list .it .c) {
    font-family: var(--mono);
    color: var(--text-2);
    width: 48px;
    flex: none;
  }
  :global(.dialog .list .it .n) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.dialog .list .it .s) {
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  :global(.dialog .foot) {
    display: flex;
    gap: 16px;
    padding: 6px 12px;
    border-top: 1px solid var(--line-strong);
    color: var(--text-3);
    font-size: var(--fs-1);
  }

  /* ---- 探して選ぶダイアログの共通の骨格（コマンドバー・ショートカット一覧・ペインの種類・設定。docs/design-dialogs.md §2） */
  :global(.dialog.lx) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--radius-dlg);
    container: lxdlg / inline-size;
  }
  :global(.dialog .lx-head) {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
  }
  :global(.dialog .lx-head h3) {
    margin: 0;
    font-size: var(--fs-3);
    white-space: nowrap;
  }
  :global(.dialog .lx-head .sub) {
    color: var(--text-3);
    font-size: var(--fs-1);
    white-space: nowrap;
  }
  /* 検索欄は 2 つの高さだけ: 主役 34px・補助 28px（.aux） */
  :global(.dialog .lx-search) {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--focus);
    border-radius: var(--radius-ctl);
    background: var(--bg);
    min-width: 0;
  }
  :global(.dialog .lx-search.aux) {
    height: 28px;
    border-color: var(--line-strong);
  }
  :global(.dialog .lx-search.aux:focus-within) {
    border-color: var(--focus);
  }
  :global(.dialog .lx-search.keymode) {
    border-style: dashed;
  }
  :global(.dialog .lx-search input) {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-3);
    outline: none;
    padding: 0;
  }
  :global(.dialog .lx-search .ph) {
    color: var(--text-3);
    font-size: var(--fs-3);
  }
  /* 範囲・探し方のチップは検索欄の下の行（狭い幅・英語でも検索欄を潰さない） */
  :global(.dialog .lx-scope) {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    padding: 0 12px 8px;
    border-bottom: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  :global(.dialog .lx-scope .r) {
    margin-left: auto;
  }
  :global(.dialog .lx-chip) {
    height: 22px;
    padding: 0 9px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: var(--panel-3);
    color: var(--text-2);
    font-size: var(--fs-1);
    cursor: pointer;
    white-space: nowrap;
  }
  :global(.dialog .lx-chip.on),
  :global(.dialog .lx-chip.sel) {
    border-color: var(--focus);
    background: var(--select-strong);
    color: var(--text);
  }
  :global(.dialog .lx-chip .n) {
    font-family: var(--mono);
    font-size: var(--fs-0);
    color: var(--text-3);
    margin-left: 4px;
  }
  :global(.dialog .lx-res) {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 0 6px;
  }
  :global(.dialog .lx-grp) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 3px;
    font-size: var(--fs-1);
    color: var(--text-3);
    letter-spacing: 0.06em;
  }
  :global(.dialog .lx-grp .n) {
    margin-left: auto;
    font-family: var(--mono);
    font-size: var(--fs-0);
    letter-spacing: 0;
  }
  /* 下の段: 選んだ項目の説明（高さは固定。出し入れしない）。右の案内は 1 行に横並び */
  :global(.dialog .lx-desc) {
    flex: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-content: start;
    gap: 2px 12px;
    height: 54px;
    padding: 7px 12px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    font-size: var(--fs-1);
    color: var(--text-2);
    overflow: hidden;
  }
  :global(.dialog .lx-desc b) {
    color: var(--text);
    font-size: var(--fs-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.dialog .lx-desc .d) {
    grid-column: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.dialog .lx-desc .r) {
    grid-row: 1;
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
  }
  :global(.dialog .lx-desc .warn) {
    color: var(--warn);
  }
  :global(.dialog .lx-foot) {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    padding: 6px 12px;
    border-top: 1px solid var(--line);
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  /* 案内の 1 つ（キーと働き）は途中で折り返さない（狭い幅で kbd と言葉が分かれないように） */
  :global(.dialog .lx-foot > span) {
    white-space: nowrap;
  }
  :global(.dialog .lx-foot .r) {
    margin-left: auto;
  }
  :global(.dialog .lx-empty) {
    padding: 30px;
    text-align: center;
    color: var(--text-3);
  }
  :global(.dialog .lx-keys) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }
  :global(.dialog .lx-keys .combo) {
    display: inline-flex;
    align-items: center;
  }
  :global(.dialog .lx-keys .or),
  :global(.dialog .lx-keys .pl) {
    color: var(--text-3);
    font-size: var(--fs-0);
    margin: 0 1px;
  }
  :global(.dialog .lx-keys kbd) {
    font-size: var(--fs-0);
    border-radius: var(--radius-ctl);
    border-bottom-width: 2px;
    min-width: 18px;
    text-align: center;
  }
  /* 当たったキー・既定から変えたキー（警告の色ではなく、強調の色。mark とそろえる） */
  :global(.dialog .lx-keys kbd.hit) {
    border-color: var(--focus);
    color: var(--focus);
  }
  :global(.dialog mark) {
    background: none;
    color: var(--focus);
    font-weight: 700;
  }
  /* 読み上げ用に隠す文 */
  :global(.dialog .lx-sr) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  :global(.dialog .lx-icon) {
    width: 16px;
    height: 16px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* 56×36 の線画の図（ペインの種類・ページの形。データは描かない）。fl 塗り・th 細い線・tk 太い線・dim 薄い・fr 枠 */
  :global(.dialog .lx-fig) {
    width: 56px;
    height: 36px;
    flex: none;
    color: var(--text-3);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  :global(.dialog .lx-fig .fr),
  :global(.dialog .lx-fig .dim) {
    stroke: var(--line-strong);
  }
  :global(.dialog .lx-fig .fl) {
    fill: currentColor;
    fill-opacity: 0.35;
  }
  :global(.dialog .lx-fig .th) {
    stroke-width: 0.9;
    stroke: var(--line-strong);
  }
  :global(.dialog .lx-fig .tk) {
    stroke-width: 3;
  }
  @container lxdlg (max-width: 600px) {
    :global(.dialog .lx-foot .r),
    :global(.dialog .lx-scope .r) {
      display: none;
    }
  }
</style>
