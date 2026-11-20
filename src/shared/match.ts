// 探して選ぶダイアログの照合（コマンドバー・ショートカット一覧・ペインの種類・設定。docs/design-dialogs.md §2）。
// NFKC・小文字・カタカナをひらがなに寄せ、空白で分けた語をすべて含むものを残す（AND）。語の頭で当たったものを上に。
// 当たった範囲は元の文字列の位置で返す（画面は segments で区切って描く。{@html} を使わない）。

/** 比べるための形: NFKC・小文字・カタカナ → ひらがな */
export function fold(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export interface Match {
  /** 大きいほど上に出す。語の頭 4・区切りのあと 3・中ほど 1、別名だけで当たった語は 0.5 */
  score: number
  /** 当たった範囲（元の文字列の [始め, 終わり)）。別名で当たった語は含めない */
  ranges: [number, number][]
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
/** 区切りとみなす文字（この直後で当たったら語の頭に準じる） */
const SEP = /[\s・/／（）()、。:：\-_.,「」]/

/**
 * 書記素（見た目の 1 文字）ずつ寄せて、寄せた文字列の各位置が元のどこから来たかを覚える。
 * コードポイントごとだと合成される文字（半角カナ＋半角濁点）が分かれ、NFKC で長さが変わる文字（㍿）の境もずれる
 */
function folded(s: string): { text: string; from: number[]; to: number[]; prev: string[] } {
  let text = ''
  const from: number[] = []
  const to: number[] = []
  const prev: string[] = [] // 各位置の元の書記素の 1 つ前の書記素（語の頭の判定）
  let before = ''
  for (const { segment, index } of graphemes.segment(s)) {
    const f = fold(segment)
    for (let k = 0; k < f.length; k++) {
      from.push(index)
      to.push(index + segment.length)
      prev.push(k === 0 ? before : segment)
    }
    text += f
    before = segment
  }
  return { text, from, to, prev }
}

/** q の語をすべて含むか。alias（別名・説明など）でも当てる。当たらなければ null */
export function matchText(q: string, text: string, alias: readonly string[] = []): Match | null {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return { score: 0, ranges: [] }
  const t = folded(text)
  const al = alias.map(fold)
  let score = 0
  const ranges: [number, number][] = []
  for (const w of words) {
    const i = t.text.indexOf(w)
    if (i >= 0) {
      ranges.push([t.from[i]!, t.to[i + w.length - 1]!])
      score += i === 0 ? 4 : SEP.test(t.prev[i] ?? '') ? 3 : 1
    } else if (al.some((a) => a.includes(w))) score += 0.5
    else return null
  }
  return { score, ranges }
}

/** 当たった範囲で文字列を区切る（重なった範囲はまとめる） */
export function segments(text: string, ranges: readonly [number, number][]): { text: string; hit: boolean }[] {
  if (!text) return []
  const on = new Array<boolean>(text.length).fill(false)
  for (const [a, b] of ranges) for (let i = Math.max(0, a); i < Math.min(text.length, b); i++) on[i] = true
  const out: { text: string; hit: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === on[i]) last.text += text[i]
    else out.push({ text: text[i]!, hit: on[i]! })
  }
  return out
}

/** 当たったものだけを点数の順に（同じ点数は元の順）。q が空ならすべてを元の順に */
export function rankBy<T>(q: string, items: readonly T[], text: (x: T) => string, alias: (x: T) => readonly string[] = () => []) {
  const out: { item: T; m: Match; i: number }[] = []
  items.forEach((item, i) => {
    const m = matchText(q, text(item), alias(item))
    if (m) out.push({ item, m, i })
  })
  return out.sort((a, b) => b.m.score - a.m.score || a.i - b.i).map(({ item, m }) => ({ item, m }))
}
