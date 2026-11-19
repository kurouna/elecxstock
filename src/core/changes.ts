import type { Events } from '@shared/api'

// 利用者のデータを変えるメソッドと、変わったデータの種類。worker.ts が実行のあとに全部の窓へ user.changed で知らせる
// （ほかの窓が読み直す）。利用者のデータを書くメソッドを足したら、ここにも足す（CLAUDE.md「マルチモニタ」）
export type ChangeKind = Events['user.changed']['kind']

export const CHANGES: Partial<Record<string, ChangeKind>> = {
  'user.saveSettings': 'settings',
  'user.saveWatchlists': 'watchlists',
  'watchlists.toggleItem': 'watchlists',
  'user.saveScreens': 'screens',
  'portfolio.save': 'holdings',
  'portfolio.applyImport': 'holdings',
  'portfolio.applyCsv': 'holdings',
  'portfolio.undoImport': 'holdings',
  // 資産推移の記録を消す（FR-PF2）
  'folio.clear': 'folio',
  // 設定の利用者の銘柄・保存期間
  'instruments.addUser': 'settings',
  'instruments.removeUser': 'settings',
  'jobs.applyRetention': 'settings',
  // アラート（FR-AL10）
  'alerts.save': 'alerts',
  'alerts.remove': 'alerts',
  'alerts.restore': 'alerts',
  'alerts.setEnabled': 'alerts',
  // チャートの描画（FR-C17。フリー N でも書ける。知らせに銘柄の ID を付ける）
  'drawings.create': 'drawings',
  'drawings.update': 'drawings',
  'drawings.remove': 'drawings',
  'drawings.clear': 'drawings',
  // 設定・ウォッチリスト・スクリーン・保有をまとめて変える
  'user.importAll': 'all',
  'user.undoImport': 'all',
}

/**
 * フリー N（2 枚目以降の窓）から呼べる書き込み（許可リスト。docs/design-multimonitor.md §3.3）。CHANGES にあってここに無いメソッドと、
 * MAIN_ONLY のメソッドは 1 枚目だけ（dispatch.ts が断る）。CHANGES に足したメソッドは、ここに足さない限りフリー N から書けない
 */
export const FREE_WRITES: ReadonlySet<string> = new Set([
  'watchlists.toggleItem', // ★・◆（Core が入れ・外しする）
  'alerts.save', // 新しく作ることだけ（id のあるもの＝直すのは 1 枚目。dispatch.ts）
  'user.saveSettings', // チャートの移動平均の期間・最近使った条件（設定の画面は 1 枚目だけ）
  'instruments.addUser', // 銘柄ジャンプで一覧に無いコードを開く
  'drawings.create',
  'drawings.update',
  'drawings.remove',
  'drawings.clear',
])
/** ほかの窓に知らせない（CHANGES に無い）が、1 枚目だけが呼べるメソッド */
export const MAIN_ONLY: ReadonlySet<string> = new Set([
  'user.saveLayout', // 1 枚目のレイアウトとマイレイアウトのページ（フリー N は開くときに読むだけ。FR-L14）
  'user.saveLayouts',
  'alerts.markRead', // ベルは 1 枚目だけ
  'jobs.reset', // 全データの削除（設定の画面）
  'data.importJpx', // 銘柄一覧の取り込み（設定の画面・初回）
])
