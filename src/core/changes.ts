// 利用者のデータを変えるメソッドと、変わったデータの種類。worker.ts が実行のあとに全部の窓へ user.changed で知らせる
// （ほかの窓が読み直す）。利用者のデータを書くメソッドを足したら、ここにも足す（CLAUDE.md「マルチモニタ」）
export type ChangeKind = 'settings' | 'watchlists' | 'holdings' | 'screens' | 'all'

export const CHANGES: Partial<Record<string, ChangeKind>> = {
  'user.saveSettings': 'settings',
  'user.saveWatchlists': 'watchlists',
  'watchlists.toggleItem': 'watchlists',
  'user.saveScreens': 'screens',
  'portfolio.save': 'holdings',
  'portfolio.applyImport': 'holdings',
  'portfolio.applyCsv': 'holdings',
  'portfolio.undoImport': 'holdings',
  // 設定の利用者の銘柄・保存期間
  'instruments.addUser': 'settings',
  'instruments.removeUser': 'settings',
  'jobs.applyRetention': 'settings',
  // 設定・ウォッチリスト・スクリーン・保有をまとめて変える
  'user.importAll': 'all',
  'user.undoImport': 'all',
}
