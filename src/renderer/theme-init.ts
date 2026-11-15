// 起動の最初のテーマ（NFR-Q3）。設定を Core から読む前に、main が保存した設定から読んだテーマを html に当てる
// （ライトテーマで起動したときに、一度黒い画面が出ないように）。main.ts の最初のほうで読み込む
const theme = (window as { elecxstock?: { initialTheme?: string } }).elecxstock?.initialTheme
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
