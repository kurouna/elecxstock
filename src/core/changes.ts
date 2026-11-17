// 利用者のデータを変えるメソッドと、変わったデータの種類。worker.ts が実行のあとに全部の窓へ user.changed で知らせる
// （ほかの窓が読み直す）。利用者のデータを書くメソッドを足したら、ここにも足す（CLAUDE.md「マルチモニタ」）
export type ChangeKind = 'settings' | 'watchlists' | 'holdings' | 'screens' | 'alerts' | 'folio' | 'drawings' | 'all'

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
