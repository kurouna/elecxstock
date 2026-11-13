<script lang="ts">
// ショートカット一覧（F1。FR-KB7）。フォーカス中のペインで効くキーに印を付ける。
// 割り当てを変えられるキー（アクションの登録表）は、今の割り当てを出す（FR-KB6）。
import { keyOf } from '../../lib/commands'
import { app, t } from '../../stores/app.svelte'
import { findPane } from '../../stores/layout.svelte'

const ja = $derived(app.settings.lang === 'ja')
const K = (...ids: string[]) => ids.map((id) => keyOf(id) || '—').join(' / ')
const G = $derived([
  {
    id: 'general',
    title: t('help.general'),
    rows: [
      [ja ? '銘柄ジャンプ' : 'Symbol jump', '1–9'],
      [ja ? 'ジャンプの候補をお気に入りに / 見ているリストに足す' : 'Jump: favorite / add to the focused list', 'Ctrl+D / Ctrl+Enter'],
      [ja ? 'コマンドバー' : 'Command bar', 'Ctrl+K'],
      [ja ? 'ショートカット一覧' : 'Shortcuts', K('help')],
      [ja ? 'ペイン間の移動' : 'Move between panes', 'Alt+← → ↑ ↓'],
      [ja ? 'ペインを順に巡る' : 'Cycle panes', 'F6 / Shift+F6'],
      [ja ? '最大化 / 戻す' : 'Maximize / restore', K('max')],
      [ja ? '右に分割 / 下に分割 / 閉じる' : 'Split right / down / close', K('split', 'splitDown', 'close')],
      [ja ? 'ペインの種類を変える' : 'Change pane type', K('changeWidget')],
      [ja ? '区切り線を動かす' : 'Move divider', 'Alt+Shift+Arrows'],
      [ja ? 'ペインを入れ替える（タイトルのドラッグでも）' : 'Swap pane (or drag the title)', 'Ctrl+Alt+Shift+Arrows'],
      [ja ? 'サイズを元に戻す / 取り消し' : 'Reset sizes / undo', `${K('resetSizes')} / Ctrl+Z`],
      [ja ? 'リンク色 1〜5 / 解除' : 'Link color 1–5 / none', 'Ctrl+1–5 / Ctrl+0'],
      [ja ? 'レイアウト（プリセット）' : 'Layouts (presets)', 'Ctrl+Shift+1–8'],
      [ja ? 'レイアウトの一覧（名前を付けて保存）' : 'Saved layouts', K('layouts')],
      [ja ? 'お気に入り' : 'Favorite', K('fav')],
      [ja ? 'ウォッチリストに追加' : 'Add to watchlist', K('addTo')],
      [ja ? 'データ更新 / 選んだ銘柄の取り直し' : 'Update / refetch selection', K('update', 'refetch')],
      [ja ? '設定（キーの割り当ても）' : 'Settings (incl. key bindings)', K('settings')],
      [ja ? '全画面' : 'Full screen', K('fullscreen')],
      [ja ? 'アプリを終了' : 'Quit', K('quit')],
      [ja ? '閉じる・戻す' : 'Close / back', 'Esc'],
    ],
  },
  {
    id: 'list',
    title: t('help.list'),
    rows: [
      [ja ? '行を移動（チャートが追従）' : 'Move row (charts follow)', '↑ ↓ PgUp PgDn Home End'],
      [ja ? '列を移動 / 並べ替え' : 'Move column / sort', '← → / S'],
      [ja ? '列の選択' : 'Choose columns', 'Ctrl+Shift+C'],
      [ja ? 'リンクグループに送る' : 'Send to link group', 'Enter'],
      [ja ? '複数選択 / すべて選択' : 'Extend selection / select all', 'Shift+↑ ↓ / Ctrl+A'],
      [ja ? 'リストに追加（選んだ銘柄）' : 'Add selection to a list', K('addTo')],
      [ja ? '★のみ表示' : '★ only', 'Ctrl+Shift+F'],
      [ja ? 'リストから外す / リストを削除' : 'Remove / delete list', 'Delete / Shift+Delete'],
      [ja ? '行を並べ替える' : 'Reorder rows', 'Alt+↑ ↓'],
      [ja ? 'リストの切り替え / 並べ替え' : 'Switch / reorder lists', 'Ctrl+PgUp PgDn / Ctrl+Shift+PgUp PgDn'],
      [ja ? 'リストの名前の変更' : 'Rename list', 'F2'],
    ],
  },
  {
    id: 'screener',
    title: t('help.screener'),
    rows: [
      [ja ? '条件へ移る / 結果へ戻る' : 'Conditions / results', 'Tab'],
      [ja ? '値を変える / 値を入力 / 比較を反転' : 'Step / type value / flip operator', '← → / Enter / O'],
      [ja ? 'かつ・または / 相対条件（別の指標と比べる）' : 'And/or / relative condition', 'A / R'],
      [ja ? '条件を追加 / 削除' : 'Add / remove condition', 'Insert / Delete'],
      [ja ? '上位 N 件に絞る' : 'Keep top N', 'T'],
      [ja ? '上書き保存 / 名前を付けて保存' : 'Save / save as', 'Ctrl+S / Ctrl+Shift+S'],
      [ja ? 'スクリーンを開く / 名前の変更' : 'Open / rename screen', `${K('screens')} / F2`],
      [ja ? 'グリッドで開く' : 'Open in grid', K('openGrid')],
    ],
  },
  {
    id: 'chart',
    title: t('help.chart'),
    rows: [
      [ja ? '日足 / 週足 / 月足' : 'Daily / weekly / monthly', 'D / W / M'],
      [ja ? '銘柄を変える' : 'Change symbol', 'C'],
      [ja ? '対数軸 / 価格の調整 / 種類' : 'Log scale / adjustment / type', 'L / A / T'],
      [ja ? '指標・移動平均・比較・表示期間の同期' : 'Indicators, MAs, compare, range sync', 'I'],
      [ja ? 'ズーム / 既定に戻す' : 'Zoom / reset', '+ − / 0'],
      [ja ? '時間方向のスクロール' : 'Scroll in time', '← → (Shift)'],
      [ja ? 'キーボード十字線' : 'Keyboard crosshair', 'X → ← →'],
      [ja ? 'マルチ時間軸: 段の移動 / 並べ方' : 'Multi-timeframe: row / arrangement', 'Tab / V'],
    ],
  },
  {
    id: 'grid',
    title: t('help.grid'),
    rows: [
      [ja ? 'タイルを移動（端を越えると次・前のページ）/ ページ' : 'Move tile (wraps to next/prev page) / page', 'Arrows / PgUp PgDn'],
      [ja ? '全タイルの時間軸 / 期間' : 'All tiles: timeframe / period', 'D W M / Alt+1–6'],
      [ja ? '格子を細かく / 粗く' : 'Finer / coarser grid', '+ / −'],
      [ja ? '対数 / 比較% / MA / 並べ替え' : 'Log / compare % / MA / sort', 'L / N / I / S'],
      [ja ? '対象の切り替え' : 'Switch source', 'G / Shift+G'],
      [ja ? 'タイルの銘柄を差し替える' : 'Replace the tile’s symbol', 'C'],
      [ja ? '銘柄を足す / 外す / 並べ替え' : 'Add / remove / reorder', '1–9 / Delete / Alt+← →'],
      [ja ? '今の並びを固定' : 'Pin the current set', 'P'],
      [ja ? '売買候補の印 / 印だけ表示' : 'Mark candidate / only marked', 'Space / Shift+Space'],
      [ja ? 'お気に入り / ★だけ表示' : 'Favorite / ★ only', 'F / Shift+F'],
      [ja ? '印の銘柄をリストに追加' : 'Add marked to a list', K('addTo')],
      [ja ? '1 枚を最大化 / 日付同期' : 'Maximize tile / date sync', 'Enter / X'],
    ],
  },
  {
    id: 'market',
    title: t('help.market'),
    rows: [
      [ja ? 'ヒートマップ: 移動 / 業種の中へ / 戻る' : 'Heatmap: move / drill in / back', 'Arrows / Enter / Esc'],
      [ja ? 'ヒートマップ: 期間' : 'Heatmap: period', 'P'],
      [ja ? 'ランキング: 指標 / 上位・下位 / 市場' : 'Ranking: metric / top-bottom / market', 'S / Shift+S / G'],
      [ja ? '保有: 楽天証券の CSV を取り込む / 送る' : 'Portfolio: import Rakuten CSV / send', 'Insert / Enter'],
    ],
  },
  {
    id: 'drawer',
    title: t('help.drawer'),
    rows: [
      [ja ? '左 / 右のドロワー' : 'Left / right drawer', K('drawer', 'drawerRight')],
      [ja ? 'ピン留め' : 'Pin', K('drawerPin')],
      [ja ? 'ドロワーのタブを切り替え' : 'Switch drawer tab', 'Ctrl+Tab'],
      [
        ja ? 'ペインをドロワーへ（タイトルを帯に落としても）' : 'Move pane to a drawer (or drop on its rail)',
        ja ? 'コマンドバー' : 'Command bar',
      ],
      [ja ? '閉じる' : 'Close', 'Esc'],
    ],
  },
])
const ctx = $derived(
  (
    {
      watchlist: 'list',
      screener: 'screener',
      chart: 'chart',
      mtf: 'chart',
      grid: 'grid',
      divcal: 'list',
      jobs: 'list',
      info: 'general',
      heatmap: 'market',
      ranking: 'market',
      market: 'market',
      portfolio: 'market',
    } as Record<string, string>
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
    width: 980px;
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
