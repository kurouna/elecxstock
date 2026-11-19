// 検索語の強調（条件を選ぶダイアログ。FR-SC17）。全角・半角・大小文字を無視して探し（NFKC と小文字）、元の文字の位置で囲む

const norm = (s: string) => s.normalize('NFKC').toLowerCase()
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;')

/**
 * s の中で q に当たる範囲（元の文字列の [始め, 終わり)）。無ければ null。
 * 1 文字ずつ正規化して元の位置を覚えておく（NFKC で長さが変わる文字があっても、元の文字の境で切る）
 */
export function matchRange(s: string, q: string): [number, number] | null {
  const nq = norm(q)
  if (!nq) return null
  let ns = ''
  const from: number[] = [] // 正規化した文字列の各位置が、元の何文字目から来たか
  let at = 0
  for (const ch of s) {
    const n = norm(ch)
    for (let k = 0; k < n.length; k++) from.push(at)
    ns += n
    at += ch.length
  }
  const i = ns.indexOf(nq)
  if (i < 0) return null
  const last = from[i + nq.length - 1]!
  const end = last + (s.codePointAt(last)! > 0xffff ? 2 : 1)
  return [from[i]!, end]
}

/** 名前を HTML にする（当たった所だけ <mark>。エスケープは切ったあとにするので、&amp; の中を囲まない） */
export function highlightHtml(s: string, q: string): string {
  const r = q ? matchRange(s, q) : null
  if (!r) return esc(s)
  return `${esc(s.slice(0, r[0]))}<mark>${esc(s.slice(r[0], r[1]))}</mark>${esc(s.slice(r[1]))}`
}
