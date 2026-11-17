// F1 の一覧のニュースの段（docs/design-news.md §7.3）。ペインの中のキー（割り当ては変えられない）
export function newsHelp(ja: boolean, title: string): { id: string; title: string; rows: [string, string][] } {
  return {
    id: 'news',
    title,
    rows: [
      [ja ? '見出しを選ぶ' : 'Select a headline', '↑ ↓ / PgUp PgDn / Home End'],
      [ja ? 'ブラウザで開く' : 'Open in browser', 'Enter'],
      [ja ? '分類のタブ' : 'Category tabs', 'G / Shift+G / Ctrl+PgDn / Ctrl+PgUp'],
      [ja ? '絞り込み（Esc で消す）' : 'Filter (Esc clears)', '/'],
      [ja ? '選んだ見出しをコピー' : 'Copy the selected headline', 'Ctrl+C'],
      [ja ? '表示中の見出しをまとめてコピー（100 件まで）' : 'Copy shown headlines (up to 100)', 'Ctrl+Alt+C'],
      [ja ? 'プレビュー / 今すぐ確かめる / 設定' : 'Preview / check now / settings', 'P / R / N'],
    ],
  }
}
