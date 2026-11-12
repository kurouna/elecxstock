<script lang="ts">
// ショートカット一覧（F1。FR-KB7）。フォーカス中のペインで効くキーに印を付ける。
import { app, t } from '../../stores/app.svelte'
import { findPane } from '../../stores/layout.svelte'

const ja = $derived(app.settings.lang === 'ja')
const G = $derived([
  {
    id: 'general',
    title: t('help.general'),
    rows: [
      [ja ? '銘柄ジャンプ' : 'Symbol jump', '1–9'],
      [ja ? 'コマンドバー' : 'Command bar', 'Ctrl+K'],
      [ja ? 'ショートカット一覧' : 'Shortcuts', 'F1'],
      [ja ? 'ペイン間の移動' : 'Move between panes', 'Alt+← → ↑ ↓'],
      [ja ? 'ペインを順に巡る' : 'Cycle panes', 'F6 / Shift+F6'],
      [ja ? '最大化 / 戻す' : 'Maximize / restore', 'Ctrl+Shift+Enter'],
      [ja ? '右に分割 / 下に分割 / 閉じる' : 'Split right / down / close', 'Ctrl+Shift+E / O / W'],
      [ja ? 'ペインの種類を変える' : 'Change pane type', 'Ctrl+Shift+N'],
      [ja ? '区切り線を動かす' : 'Move divider', 'Alt+Shift+Arrows'],
      [ja ? 'ペインを入れ替える' : 'Swap pane', 'Ctrl+Alt+Shift+Arrows'],
      [ja ? 'サイズを元に戻す / 取り消し' : 'Reset sizes / undo', 'Ctrl+Alt+R / Ctrl+Z'],
      [ja ? 'リンク色 1〜5 / 解除' : 'Link color 1–5 / none', 'Ctrl+1–5 / Ctrl+0'],
      [ja ? 'レイアウト（プリセット）' : 'Layouts (presets)', 'Ctrl+Shift+1–5'],
      [ja ? 'お気に入り' : 'Favorite', 'Ctrl+D'],
      [ja ? 'ウォッチリストに追加' : 'Add to watchlist', 'Ctrl+Shift+A'],
      [ja ? 'データ更新 / 選択銘柄の取り直し' : 'Update / refetch selected', 'F5 / Shift+F5'],
      [ja ? '設定' : 'Settings', 'Ctrl+,'],
      [ja ? '全画面' : 'Full screen', 'F11'],
      [ja ? '閉じる・戻す' : 'Close / back', 'Esc'],
    ],
  },
  {
    id: 'list',
    title: t('help.list'),
    rows: [
      [ja ? '行を移動（チャートが追従）' : 'Move row (charts follow)', '↑ ↓ PgUp PgDn Home End'],
      [ja ? '列を移動 / 並べ替え' : 'Move column / sort', '← → / S'],
      [ja ? 'リンクグループに送る' : 'Send to link group', 'Enter'],
      [ja ? '★のみ表示' : '★ only', 'Ctrl+Shift+F'],
      [ja ? 'リストから外す / リストを削除' : 'Remove / delete list', 'Delete / Shift+Delete'],
      [ja ? '行を並べ替える' : 'Reorder rows', 'Alt+↑ ↓'],
      [ja ? 'リストの切り替え / 名前の変更' : 'Switch / rename list', 'Ctrl+PgUp PgDn / F2'],
    ],
  },
  {
    id: 'screener',
    title: t('help.screener'),
    rows: [
      [ja ? '条件へ移る / 結果へ戻る' : 'Conditions / results', 'Tab'],
      [ja ? '値を変える / 値を入力 / 比較を反転' : 'Step / type value / flip operator', '← → / Enter / O'],
      [ja ? '条件を追加 / 削除' : 'Add / remove condition', 'Insert / Delete'],
      [ja ? '上書き保存 / 名前を付けて保存' : 'Save / save as', 'Ctrl+S / Ctrl+Shift+S'],
      [ja ? 'スクリーンを開く / 名前の変更' : 'Open / rename screen', 'Ctrl+O / F2'],
      [ja ? 'グリッドで開く' : 'Open in grid', 'Ctrl+Shift+G'],
    ],
  },
  {
    id: 'chart',
    title: t('help.chart'),
    rows: [
      [ja ? '日足 / 週足 / 月足' : 'Daily / weekly / monthly', 'D / W / M'],
      [ja ? '対数軸 / 価格の調整' : 'Log scale / adjustment', 'L / A'],
      [ja ? 'ズーム / 既定に戻す' : 'Zoom / reset', '+ − / 0'],
      [ja ? '時間方向のスクロール' : 'Scroll in time', '← → (Shift)'],
      [ja ? 'キーボード十字線' : 'Keyboard crosshair', 'X → ← →'],
    ],
  },
  {
    id: 'grid',
    title: t('help.grid'),
    rows: [
      [ja ? 'タイルを移動 / ページ' : 'Move tile / page', 'Arrows / PgUp PgDn'],
      [ja ? '全タイルの時間軸 / 期間' : 'All tiles: timeframe / period', 'D W M / Alt+1–6'],
      [ja ? '格子を細かく / 粗く' : 'Finer / coarser grid', '+ / −'],
      [ja ? '対数 / 比較% / MA / 並べ替え' : 'Log / compare % / MA / sort', 'L / N / I / S'],
      [ja ? '売買候補の印 / 印だけ表示' : 'Mark candidate / only marked', 'Space / Shift+Space'],
      [ja ? '1 枚を最大化 / 日付同期' : 'Maximize tile / date sync', 'Enter / X'],
      [ja ? '今の銘柄で固定 / 外す / 並べ替え' : 'Pin / remove / reorder', 'P / Delete / Alt+← →'],
    ],
  },
  {
    id: 'drawer',
    title: t('help.drawer'),
    rows: [
      [ja ? '左のドロワー' : 'Left drawer', 'Ctrl+B'],
      [ja ? 'ピン留め' : 'Pin', 'Ctrl+Alt+B'],
      [ja ? '閉じる' : 'Close', 'Esc'],
    ],
  },
])
const ctx = $derived(
  (
    { watchlist: 'list', screener: 'screener', chart: 'chart', grid: 'grid', divcal: 'list', jobs: 'list', info: 'general' } as Record<
      string,
      string
    >
  )[findPane(app.focus)?.widget ?? ''] ?? '',
)
</script>

<div class="dialog help" role="dialog" aria-label={t('help.title')}>
  <h3><span>{t('help.title')}</span><span class="muted note">{t('help.focus')} · Esc</span></h3>
  <div class="cols">
    {#each G as g (g.id)}
      <section>
        <h4 class:ctx={g.id === ctx}>{g.title}{g.id === ctx ? ' ●' : ''}</h4>
        {#each g.rows as [a, k] (a)}
          <div class="row"><span>{a}</span><kbd>{k}</kbd></div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .help {
    width: 960px;
    padding: var(--s-3) var(--s-4) var(--s-4);
  }
  h3 {
    display: flex;
    justify-content: space-between;
  }
  .note {
    font-weight: 400;
    font-size: var(--fs-1);
  }
  .cols {
    columns: 2;
    column-gap: 24px;
  }
  section {
    break-inside: avoid;
    margin-bottom: var(--s-3);
  }
  h4 {
    margin: 0 0 4px;
    font-size: var(--fs-1);
    color: var(--text-3);
    letter-spacing: 0.08em;
  }
  h4.ctx {
    color: var(--focus);
  }
  .row {
    display: flex;
    justify-content: space-between;
    min-height: 22px;
    align-items: center;
    border-bottom: 1px solid var(--line);
    gap: 12px;
  }
</style>
