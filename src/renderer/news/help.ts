// F1 の一覧のニュースの段（docs/design-news.md §7.3）。ペインの中のキー（割り当ては変えられない）。1 行 1 操作（docs/design-dialogs.md §4）
export const NEWS_SHORTCUTS: { label: [string, string]; keys: string }[] = [
  { label: ['見出しを選ぶ', 'Select a headline'], keys: '↑ ↓ / PgUp PgDn / Home End' },
  { label: ['ブラウザで開く', 'Open in browser'], keys: 'Enter' },
  { label: ['分類のタブ', 'Category tabs'], keys: 'G / Shift+G / Ctrl+PgDn / Ctrl+PgUp' },
  { label: ['絞り込み（Esc で消す）', 'Filter (Esc clears)'], keys: '/' },
  { label: ['選んだ見出しをコピー', 'Copy the selected headline'], keys: 'Ctrl+C' },
  { label: ['表示中の見出しをまとめてコピー（100 件まで）', 'Copy shown headlines (up to 100)'], keys: 'Ctrl+Alt+C' },
  { label: ['プレビュー', 'Preview'], keys: 'P' },
  { label: ['今すぐ確かめる', 'Check now'], keys: 'R' },
  { label: ['ニュースの設定', 'News settings'], keys: 'N' },
]
