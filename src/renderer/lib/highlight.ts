// 検索語の強調（条件を選ぶダイアログ。FR-SC17）。全角・半角・大小文字を無視して探し（NFKC と小文字）、元の文字の位置で囲む

/** 検索の正規化（NFKC と小文字）。条件を選ぶダイアログの当たり判定もこれを使い、強調と食い違わないようにする */
export const normText = (s: string) => s.normalize('NFKC').toLowerCase()
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * s の中で q に当たる範囲（元の文字列の [始め, 終わり)）。無ければ null。
 * 書記素（見た目の 1 文字）ずつ正規化して元の位置を覚えておく。コードポイントごとだと、合成される文字
 * （半角カナ＋半角濁点 ｶﾞ → ガ、か＋結合用の濁点 → が）が分かれて当たらない。NFKC で長さが変わる文字
 * （㍿ → 株式会社）があっても、元の文字の境で切る
 */
export function matchRange(s: string, q: string): [number, number] | null {
  const nq = normText(q)
  if (!nq) return null
  let ns = ''
  const from: number[] = [] // 正規化した文字列の各位置が、元のどの書記素の始めから来たか
  const to: number[] = [] // 同じく、その書記素の終わり
  for (const { segment, index } of graphemes.segment(s)) {
    const n = normText(segment)
    for (let k = 0; k < n.length; k++) {
      from.push(index)
      to.push(index + segment.length)
    }
    ns += n
  }
  const i = ns.indexOf(nq)
  if (i < 0) return null
  return [from[i]!, to[i + nq.length - 1]!]
}

/** 名前を HTML にする（当たった所だけ <mark>。エスケープは切ったあとにするので、&amp; の中を囲まない） */
export function highlightHtml(s: string, q: string): string {
  const r = q ? matchRange(s, q) : null
  if (!r) return esc(s)
  return `${esc(s.slice(0, r[0]))}<mark>${esc(s.slice(r[0], r[1]))}</mark>${esc(s.slice(r[1]))}`
}
