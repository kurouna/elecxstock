// 見出しのコピー（docs/design-news.md §7.4）で main が書く文字の検査。文字列だけ・100 KB まで・改行とタブ以外の制御文字を除く
export const COPY_MAX = 100 * 1024

export function cleanCopyText(text: unknown): string | null {
  if (typeof text !== 'string' || !text || text.length > COPY_MAX) return null
  return text.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '')
}
