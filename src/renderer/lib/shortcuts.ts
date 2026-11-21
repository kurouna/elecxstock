// ショートカット一覧（F1）の登録表と、並び・絞り込み（docs/design-dialogs.md §4。FR-KB7）。
// 1 行に 1 操作。アクション（ACTIONS）の行は act を持ち、キーは今の割り当て（keyOf）で出す。ペインの中のキーは keys に表記を書く
// （割り当ては変えられない）。表記は ' / ' で別の組み合わせ、空白で並び、+ で同時押し（lib/keys.ts の keyParts）。
// 登録表の整合は tests/unit/registry/shortcuts.test.ts が確かめる
import { type Match, matchText } from '@shared/match'
import { NEWS_SHORTCUTS } from '../news/help'
import type { WidgetId } from '../stores/layout.svelte'
import { keyHits } from './keys'

export const SECTIONS = [
  'general',
  'list',
  'screener',
  'chart',
  'grid',
  'heatmap',
  'marketlists',
  'folio',
  'info',
  'divsim',
  'drawer',
  'news',
] as const
export type SectionId = (typeof SECTIONS)[number]
/** 段の名前（i18n のキー） */
export const SECTION_KEY = {
  general: 'help.general',
  list: 'help.list',
  screener: 'help.screener',
  chart: 'help.chart',
  grid: 'help.grid',
  heatmap: 'help.heatmap',
  marketlists: 'help.marketlists',
  folio: 'help.folio',
  info: 'help.info',
  divsim: 'help.divsim',
  drawer: 'help.drawer',
  news: 'help.news',
} as const satisfies Record<SectionId, string>

export interface ShortcutRow {
  sec: SectionId
  /** 小見出し [日, 英] */
  grp: readonly [string, string]
  /** 操作の名前 [日, 英] */
  label: readonly [string, string]
  /** ペインの中のキーの表記（act が無いとき） */
  keys?: string
  /** アクションの ID（キーは keyOf で今の割り当てを出す。割り当てを変えられる） */
  act?: string
  /** 探すときの別名 */
  alias?: readonly string[]
}

type G = readonly [string, string]
/** レイアウトのプリセット（9 つのアクション）を 1 行にまとめた表記 */
export const PRESET_RANGE = 'Ctrl+Shift+1–9'
/** プリセットの行のキー: 既定のままなら範囲の 1 つ、変えたら今の割り当てを並べる（外したものは出さない） */
export function presetKeysText(keys: readonly string[]): string {
  if (keys.every((k, i) => k === `Ctrl+Shift+${i + 1}`)) return PRESET_RANGE
  return keys.filter(Boolean).join(' / ')
}
const rows: ShortcutRow[] = []
/** 段と小見出しを決めて行を足す */
const sec = (s: SectionId, grp: G) => (label: G, keysOrAct: string | { act: string }, alias?: string[]) => {
  rows.push({
    sec: s,
    grp,
    label,
    ...(typeof keysOrAct === 'string' ? { keys: keysOrAct } : { act: keysOrAct.act }),
    ...(alias ? { alias } : {}),
  })
}
const A = (act: string) => ({ act })

// ---- 全体
let r = sec('general', ['アプリ', 'App'])
r(['コマンドバー', 'Command bar'], 'Ctrl+K', ['パレット', 'palette', '検索'])
r(['ショートカット一覧', 'Shortcuts'], A('help'), ['ヘルプ', 'help'])
r(['設定（キーの割り当ても）', 'Settings (incl. key bindings)'], A('settings'))
r(['閉じる・戻す', 'Close or go back'], 'Esc')
r(['アプリを終了', 'Quit'], A('quit'))
r = sec('general', ['銘柄', 'Symbols'])
r(['銘柄ジャンプ', 'Symbol jump'], '1–9', ['コードで開く'])
r(['ジャンプの候補をお気に入りに追加', 'Jump: add to favorites'], 'Ctrl+D')
r(['ジャンプの候補を見ているリストに足す', 'Jump: add to the focused list'], 'Ctrl+Enter')
r(['お気に入り', 'Favorite'], A('fav'), ['★'])
r(['ウォッチリストに追加', 'Add to watchlist'], A('addTo'))
r(['データ更新', 'Update data'], A('update'))
r(['選んだ銘柄の取り直し', 'Refetch selection'], A('refetch'))
r = sec('general', ['ペインとレイアウト', 'Panes and layout'])
r(['ペイン間の移動', 'Move between panes'], 'Alt+← / Alt+→ / Alt+↑ / Alt+↓')
r(['ペインを順に巡る', 'Cycle panes'], 'F6 / Shift+F6')
r(['最大化・戻す（切り替え）', 'Maximize or restore'], A('max'))
r(['右に分割', 'Split right'], A('split'))
r(['下に分割', 'Split down'], A('splitDown'))
r(['ペインを閉じる', 'Close pane'], A('close'))
r(['ペインの種類を変える', 'Change pane type'], A('changeWidget'))
r(['区切り線を動かす', 'Move divider'], 'Alt+Shift+Arrows')
r(['ペインを入れ替える（タイトルのドラッグでも）', 'Swap pane (or drag the title)'], 'Ctrl+Alt+Shift+Arrows')
r(['サイズを元に戻す', 'Reset sizes'], A('resetSizes'))
r(['取り消し', 'Undo'], 'Ctrl+Z', ['元に戻す', 'undo'])
r(['リンク色 1〜5', 'Link color 1–5'], 'Ctrl+1–5')
r(['リンクの解除', 'No link'], 'Ctrl+0')
r(['レイアウト（プリセット）', 'Layouts (presets)'], PRESET_RANGE, ['タブ', 'tab'])
r = sec('general', ['マイレイアウト', 'Pages'])
r(['ページのメニュー（マイレイアウトで Ctrl+Shift+8 をもう一度でも）', 'Pages menu (or Ctrl+Shift+8 again on Pages)'], A('layouts'))
r(['メニューの中: ページを開く', 'In the menu: open a page'], '1–9')
r(['メニューの中: 新しいページ', 'In the menu: new page'], 'Insert')
r(['メニューの中: ページを複製', 'In the menu: duplicate page'], 'Shift+Insert')
r(['メニューの中: 名前を変える', 'In the menu: rename'], 'F2')
r(['メニューの中: 並べ替え', 'In the menu: reorder'], 'Alt+↑ / Alt+↓')
r(['メニューの中: 削除（2 回押す）', 'In the menu: delete (press twice)'], 'Delete')
r(['消したページを元に戻す（10 秒間）', 'Restore a deleted page (10 s)'], 'Ctrl+Z')
r = sec('general', ['ウィンドウ', 'Windows'])
r(['全画面', 'Full screen'], A('fullscreen'))
r(['新しいフリーのウィンドウ（2 枚目のモニタ用）', 'New Free window (for a second monitor)'], A('newWindow'), ['マルチモニタ'])
r(['次のウィンドウに移動', 'Next window'], A('nextWindow'))
r(['前のウィンドウに移動', 'Previous window'], A('prevWindow'))
r(['選んだ銘柄をフリーのウィンドウへ送る', 'Send selection to a Free window'], A('sendToFree'))
r(['このウィンドウの文字を大きく', 'Larger text (this window)'], A('zoomIn'), ['倍率', 'ズーム', 'zoom'])
r(['このウィンドウの文字を小さく', 'Smaller text (this window)'], A('zoomOut'), ['倍率', 'ズーム', 'zoom'])
r(['このウィンドウの文字の大きさを戻す', 'Reset text size (this window)'], A('zoomReset'), ['倍率', 'ズーム', 'zoom'])
r(['ウィンドウを閉じる', 'Close window'], 'Alt+F4')
r(['別のモニタに移す', 'Move to another monitor'], 'Win+Shift+← / Win+Shift+→')
r = sec('general', ['アラートと保有', 'Alerts and holdings'])
r(['フォーカス中の銘柄でアラートを作る', 'Create an alert for the focused symbol'], A('alertNew'))
r(['アラートの一覧と履歴', 'Alerts and history'], A('alerts'))
r(['消したアラートを戻す', 'Undo alert removal'], 'Ctrl+Z')
r(['プライバシーモード（保有の金額と数量を隠す）', 'Privacy mode (hide holding amounts and quantities)'], A('privacy'), ['金額を隠す'])

// ---- 一覧
r = sec('list', ['行と列', 'Rows and columns'])
r(['行を移動（チャートが追従）', 'Move row (charts follow)'], '↑ ↓ PgUp PgDn Home End')
r(['列を移動', 'Move column'], '← →')
r(['並べ替え', 'Sort'], 'S', ['ソート'])
r(['列の選択', 'Choose columns'], 'Ctrl+Shift+C')
r(['リンクグループに送る', 'Send to link group'], 'Enter')
r(['複数選択', 'Extend selection'], 'Shift+↑ / Shift+↓')
r(['すべて選択', 'Select all'], 'Ctrl+A')
r = sec('list', ['リスト', 'Lists'])
r(['★のみ表示', '★ only'], 'Ctrl+Shift+F', ['お気に入り'])
r(['リストから外す', 'Remove from list'], 'Delete')
r(['リストを削除', 'Delete list'], 'Shift+Delete')
r(['行を並べ替える', 'Reorder rows'], 'Alt+↑ / Alt+↓')
r(['リストの切り替え', 'Switch lists'], 'Ctrl+PgUp / Ctrl+PgDn')
r(['リストの並べ替え', 'Reorder lists'], 'Ctrl+Shift+PgUp / Ctrl+Shift+PgDn')
r(['リストの名前の変更', 'Rename list'], 'F2')

// ---- スクリーナー
r = sec('screener', ['条件', 'Conditions'])
r(['条件と結果を行き来する', 'Switch between conditions and results'], 'Tab')
r(['値を変える', 'Step value'], '← →')
r(['値を入力', 'Type value'], 'Enter')
r(['比較を反転（≥ ⇔ ≤）', 'Flip operator (≥ ⇔ ≤)'], 'O')
r(['かつ・または', 'Toggle and or'], 'A')
r(['相対条件（別の指標と比べる）', 'Relative condition'], 'R')
r(['条件を追加', 'Add condition'], 'Insert')
r(['条件を削除', 'Remove condition'], 'Delete')
r(['条件の指標を変える', 'Change field'], 'F')
r(['条件の並べ替え', 'Reorder condition'], 'Alt+↑ / Alt+↓')
r(['上位 N 件に絞る', 'Keep top N'], 'T')
r = sec('screener', ['保存', 'Saving'])
r(['上書き保存', 'Save'], 'Ctrl+S')
r(['名前を付けて保存', 'Save as'], 'Ctrl+Shift+S')
r(['スクリーニング条件を開く', 'Open screen'], A('screens'))
r(['スクリーニング条件の名前の変更', 'Rename screen'], 'F2')
r(['グリッドで開く', 'Open in grid'], A('openGrid'))

// ---- チャート
r = sec('chart', ['表示', 'View'])
r(['日足', 'Daily'], 'D', ['時間軸', 'timeframe'])
r(['週足', 'Weekly'], 'W', ['時間軸', 'timeframe'])
r(['月足', 'Monthly'], 'M', ['時間軸', 'timeframe'])
r(['銘柄を変える（一覧・銘柄情報ではリンク先のチャート）', 'Change symbol (from lists: the linked charts)'], 'C')
r(['対数軸', 'Log scale'], 'L', ['ログ', 'log'])
r(['価格の調整（未調整・配当込み）', 'Price adjustment'], 'A')
r(['チャートの種類', 'Chart type'], 'T', ['ローソク足', 'ライン'])
r(['指標・移動平均・比較・表示期間の同期', 'Indicators, MAs, compare, range sync'], 'I', ['インジケーター', 'MA'])
r(['表示期間（3か月〜全期間）', 'Visible period (3m–all)'], 'Alt+1–6')
r(['ズーム（拡大・縮小）', 'Zoom'], '+ −')
r(['ズームを既定に戻す', 'Reset zoom'], '0')
r(['時間方向のスクロール', 'Scroll in time'], '← → / Shift+← / Shift+→')
r(['キーボード十字線', 'Keyboard crosshair'], 'X')
r(['画像で保存（設定 > チャートで ON のとき）', 'Save as image (when on in Settings > Charts)'], 'S')
r = sec('chart', ['マルチ時間軸', 'Multi-timeframe'])
r(['段の移動', 'Move between rows'], 'Tab')
r(['並べ方', 'Arrangement'], 'V')
r = sec('chart', ['トレンドライン', 'Trend lines'])
r(['トレンドラインを引く', 'Draw a trend line'], 'Alt+T', ['描画'])
r(['点を決める', 'Set a point'], 'Enter')
r(['引く点を山・谷に動かす', 'Point: to swing'], 'Ctrl+← / Ctrl+→')
r(['引く点を高値〜安値に動かす', 'Point: high–low'], '↑ ↓')
r(['トレンドラインを選ぶ', 'Select trend line'], 'G')
r(['動かす対象', 'Move target'], 'Space')
r(['延長', 'Extend'], 'E')
r(['消す', 'Delete'], 'Delete')
r(['トレンドラインを戻す', 'Undo trend line'], 'Ctrl+Z')
r(['トレンドラインをやり直す', 'Redo trend line'], 'Ctrl+Y')

// ---- チャートグリッド
r = sec('grid', ['タイル', 'Tiles'])
r(['タイルを移動（端を越えると次・前のページ）', 'Move tile (wraps to next/prev page)'], 'Arrows')
r(['ページ', 'Page'], 'PgUp PgDn')
r(['1 枚を最大化', 'Maximize tile'], 'Enter')
r(['タイルの銘柄を差し替える', 'Replace the tile’s symbol'], 'C')
r(['銘柄を足す', 'Add symbol'], '1–9')
r(['銘柄を外す', 'Remove symbol'], 'Delete')
r(['タイルの並べ替え', 'Reorder tiles'], 'Alt+← / Alt+→')
r(['今の並びを固定', 'Pin the current set'], 'P')
r = sec('grid', ['表示', 'View'])
r(['全タイルの時間軸', 'All tiles: timeframe'], 'D W M')
r(['全タイルの期間', 'All tiles: period'], 'Alt+1–6')
r(['格子を細かく', 'Finer grid'], '+')
r(['格子を粗く', 'Coarser grid'], '−')
r(['対数軸', 'Log scale'], 'L')
r(['比較%（基準日からの騰落）', 'Compare %'], 'N')
r(['移動平均', 'Moving averages'], 'I')
r(['並べ替え', 'Sort'], 'S')
r(['対象の切り替え', 'Switch source'], 'G / Shift+G')
r(['日付同期', 'Date sync'], 'X')
r = sec('grid', ['売買候補', 'Candidates'])
r(['売買候補の切り替え', 'Toggle candidate'], 'Space')
r(['売買候補だけ表示', 'Candidates only'], 'Shift+Space')
r(['お気に入り', 'Favorite'], 'F')
r(['★だけ表示', '★ only'], 'Ctrl+Shift+F')
r(['売買候補をリストに追加', 'Add candidates to a list'], A('addTo'))

// ---- ヒートマップ・株価ボード
r = sec('heatmap', ['ヒートマップ', 'Heatmap'])
r(['移動', 'Move'], 'Arrows')
r(['業種の中に入る', 'Drill into a sector'], 'Enter')
r(['業種から戻る', 'Back from a sector'], 'Esc')
r(['期間', 'Period'], 'P')
r(['ヒートマップ ⇔ 株価ボード', 'Heatmap ⇔ quote cards'], 'V')
r = sec('heatmap', ['株価ボード', 'Quote cards'])
r(['カードを選ぶ', 'Select a card'], 'Arrows / PgUp PgDn / Home End')
r(['一覧', 'List'], 'G / Ctrl+PgDn')
r(['並べ替え', 'Sort'], 'S')
r(['分類', 'Group'], 'B')
r(['大きさ', 'Size'], '+ −')
r(['指数のカード', 'Index cards'], 'I')
r(['★のみ', '★ only'], 'Ctrl+Shift+F')

// ---- ランキング・マーケット一覧・騰落・マーケット
r = sec('marketlists', ['ランキング', 'Ranking'])
r(['指標', 'Metric'], 'S')
r(['上位・下位', 'Top or bottom'], 'Shift+S')
r(['市場', 'Market'], 'G')
r = sec('marketlists', ['マーケット一覧', 'Market board'])
r(['区分', 'Group'], 'G / Ctrl+PgDn')
r(['並べ替え', 'Sort'], '← → S')
r(['列の選択', 'Columns'], 'Ctrl+Shift+C')
r = sec('marketlists', ['騰落', 'Breadth'])
r(['タブ', 'Tab'], 'G / Ctrl+PgDn')
r(['中に入る', 'Drill in'], 'Enter')
r(['戻る', 'Back'], 'Esc')
r = sec('marketlists', ['マーケット', 'Market'])
r(['銘柄を足す', 'Add symbol'], '1–9')
r(['銘柄を外す', 'Remove symbol'], 'Delete')
r(['時間軸', 'Timeframe'], 'D W M')
r(['表示期間', 'Visible period'], 'Alt+1–6')

// ---- 保有・ポートフォリオ
r = sec('folio', ['保有', 'Holdings'])
r(['保有を足す', 'Add holding'], 'Insert')
r(['保有を直す', 'Edit holding'], 'E')
r(['保有を外す', 'Remove holding'], 'Delete')
r(['銘柄を送る', 'Send symbol'], 'Enter')
r = sec('folio', ['ポートフォリオ', 'Portfolio'])
r(['カードを巡る', 'Cycle cards'], 'Tab')
r(['資産推移の期間', 'History period'], 'Alt+1–6')
r(['十字線の日（連動）', 'Crosshair day (linked)'], '← →')
r(['円と %', '¥ and %'], 'P')
r(['ベンチマーク', 'Benchmark'], 'B')
r(['記録開始前の試算', 'Estimate before records'], 'E')
r(['分類', 'Grouping'], 'G')
r(['色', 'Color'], 'H')
r(['寄与の期間', 'Contribution period'], 'T')
r(['並べ替え', 'Sort'], 'S')
r(['並べ替えの逆順', 'Reverse sort'], 'Shift+S')
r(['同じ銘柄をまとめる', 'Combine same stock'], 'A')
r(['概要 ⇔ 配当の分析', 'Overview ⇔ dividends'], 'PgUp PgDn')
r(['表を開く・閉じる', 'Expand or collapse table'], '← → Space / Enter')
r(['表をすべて開く・閉じる', 'Expand or collapse all'], 'Shift+← →')

// ---- 銘柄情報
r = sec('info', ['銘柄情報', 'Symbol info'])
r(['配当の棒を選ぶ', 'Select dividend bar'], '← → Home End')
r(['年・回の切り替え', 'Per year or per payout'], 'Y')
r(['Yahoo!ファイナンスで開く', 'Open in Yahoo Finance'], 'O')

// ---- 配当シミュレータ
r = sec('divsim', ['見方', 'View'])
r(['1 銘柄 ⇔ 群', 'One stock ⇔ group'], 'O')
r(['カードを巡る', 'Cycle cards'], 'Tab')
r(['過去 ⇔ これから', 'Past ⇔ ahead'], 'PgUp PgDn')
r(['基準日', 'Base date'], 'Alt+1–4')
r(['期間', 'Horizon'], 'Alt+5')
r(['十字線・月', 'Crosshair and month'], '← →')
r = sec('divsim', ['前提', 'Assumptions'])
r(['前提のカードに移る', 'Notes'], 'N')
r(['出どころ', 'Source'], 'L')
r(['元本', 'Principal'], 'A')
r(['受取 ⇔ 再投資', 'Receive ⇔ reinvest'], 'R')
r(['税', 'Tax'], 'X')
r(['比べる相手', 'Compare with'], 'B')
r(['業種（33 ⇔ 17）', 'Sector (33 ⇔ 17)'], 'G')
r(['円と %', '¥ and %'], 'P')
r(['受取月 ⇔ 権利確定月', 'Pay month ⇔ record month'], 'V')
r(['試算の方式', 'Method'], 'M')
r(['配分', 'Weighting'], 'W')
r(['積立', 'Monthly additions'], 'D')
r(['当時の条件で選び直す', 'Re-screen with past data'], 'H')
r(['シナリオ', 'Scenarios'], 'K')
r(['並べ替え', 'Sort'], 'S')

// ---- ドロワー
r = sec('drawer', ['ドロワー', 'Drawers'])
r(['左のドロワー', 'Left drawer'], A('drawer'))
r(['右のドロワー', 'Right drawer'], A('drawerRight'))
r(['ピン留め', 'Pin'], A('drawerPin'))
r(['ドロワーのタブを切り替え', 'Switch drawer tab'], 'Ctrl+Tab / Ctrl+Shift+Tab')
r(['ペインをドロワーに移す（タイトルを帯に落としても）', 'Move pane to a drawer (or drop on its rail)'], A('toDrawer'))
r(['閉じる', 'Close'], 'Esc')

// ---- ニュース（news/help.ts）
r = sec('news', ['ニュース', 'News'])
for (const n of NEWS_SHORTCUTS) r(n.label, n.keys)

export const SHORTCUTS: readonly ShortcutRow[] = rows
/** コマンドバーに出すペインの中のキー（割り当ての変えられないキー。全体の段は入れない） */
export const PANE_KEY_ROWS: readonly ShortcutRow[] = rows.filter((r) => !r.act && r.keys && r.sec !== 'general')
/** 登録表の [日, 英] の組から言語の方を選ぶ位置 */
export const langIx = (lang: 'ja' | 'en') => (lang === 'en' ? 1 : 0)

/** ペインの種類 → 先頭に出す段（FR-KB7「いまフォーカスしているペインで効くキーを先に」） */
const HELP_SECTION: Record<WidgetId, SectionId> = {
  watchlist: 'list',
  screener: 'screener',
  chart: 'chart',
  mtf: 'chart',
  grid: 'grid',
  divcal: 'list',
  jobs: 'list',
  info: 'info',
  heatmap: 'heatmap',
  ranking: 'marketlists',
  board: 'marketlists',
  breadth: 'marketlists',
  market: 'marketlists',
  portfolio: 'folio',
  folio: 'folio',
  divsim: 'divsim',
  news: 'news',
}
export function helpSection(widget: WidgetId | string | undefined): SectionId | '' {
  return HELP_SECTION[widget as WidgetId] ?? ''
}
/** 段の順: フォーカス中のペインの段を先頭に、ほかは決まった順 */
export function sectionOrder(ctx: SectionId | ''): SectionId[] {
  return ctx ? [ctx, ...SECTIONS.filter((s) => s !== ctx)] : [...SECTIONS]
}
/** 行のキーの表記（アクションは今の割り当て。プリセットの行は 9 つのアクションの今の割り当て） */
export const rowKeys = (row: ShortcutRow, keyOf: (id: string) => string, presetIds: readonly string[] = []) =>
  row.act
    ? keyOf(row.act)
    : row.keys === PRESET_RANGE && presetIds.length
      ? presetKeysText(presetIds.map((p) => keyOf(`layout.${p}`)))
      : (row.keys ?? '')
/** 割り当てを変えられる行か（アクションの行と、9 つの layout.* のアクションをまとめたプリセットの行。FR-KB6） */
export const rebindable = (row: ShortcutRow): boolean => !!row.act || row.keys === PRESET_RANGE
/** 割り当てを既定から変えた行の既定のキーの表記（変えていなければ null。外したアクションの既定が無ければ ''） */
export function rowDefault(
  row: ShortcutRow,
  keyOf: (id: string) => string,
  defaultOf: (id: string) => string,
  presetIds: readonly string[] = [],
): string | null {
  if (!rebindable(row)) return null
  const def = rowKeys(row, defaultOf, presetIds)
  return rowKeys(row, keyOf, presetIds) === def ? null : def
}
/** 「文字で探す ⇔ キーで探す」を切り替えるキー（Tab・Shift+Tab だけ。Ctrl+Tab などは探すキーとして受ける） */
export const isModeToggle = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): boolean =>
  e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey

/**
 * 絞り込み（並びは変えない）。文字で: 名前（言語ごと）・別名・小見出し・キーの表記で当てる。
 * キーを押して（combo）: その組み合わせを使う行だけ（1–9・Alt+1–6・Arrows の範囲にも）
 */
export function filterShortcuts(
  list: readonly ShortcutRow[],
  o: { q: string; combo: string; lang: 'ja' | 'en'; keyOf: (id: string) => string; presetIds?: readonly string[] },
): { row: ShortcutRow; ranges: Match['ranges'] }[] {
  const li = o.lang === 'en' ? 1 : 0
  const out: { row: ShortcutRow; ranges: Match['ranges'] }[] = []
  for (const row of list) {
    const keys = rowKeys(row, o.keyOf, o.presetIds)
    if (o.combo) {
      if (keyHits(keys, o.combo)) out.push({ row, ranges: [] })
      continue
    }
    const m = matchText(o.q, row.label[li], [...(row.alias ?? []), row.grp[li], keys, keys.replace(/\+/g, ' ')])
    if (m) out.push({ row, ranges: m.ranges })
  }
  return out
}
/** 続いた同じ小見出しの行を 1 つのまとまりに（段の中の小見出し） */
export function blocks<T extends { row: Pick<ShortcutRow, 'grp'> }>(items: readonly T[]): { grp: readonly [string, string]; items: T[] }[] {
  const out: { grp: readonly [string, string]; items: T[] }[] = []
  for (const it of items) {
    const last = out[out.length - 1]
    if (last && last.grp[0] === it.row.grp[0]) last.items.push(it)
    else out.push({ grp: it.row.grp, items: [it] })
  }
  return out
}
/** 前・次の段の先頭の行の位置（PgUp / PgDn）。secs は並んだ行の段 */
export function jumpSection(secs: readonly string[], cur: number, dir: 1 | -1): number {
  if (!secs.length) return 0
  const order = secs.filter((s, i) => i === 0 || secs[i - 1] !== s)
  const at = order.indexOf(secs[Math.min(cur, secs.length - 1)]!)
  const next = order[Math.max(0, Math.min(order.length - 1, at + dir))]!
  return secs.indexOf(next)
}
