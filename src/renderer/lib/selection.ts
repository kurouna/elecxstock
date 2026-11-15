// 一覧で選んでいる行を、位置ではなく行の中身（銘柄など）で追う（FR-W4）。
// 取得で値が変わって並びが入れ替わっても、選んでいた銘柄から動かない。並べ替え・別の一覧に替えるなど、
// 利用者が先頭から選び直す操作は reset() を呼ぶ（そのときは追わずに先頭のまま）

/** prev の i 番目の行が next の何番目か（無ければ -1） */
export function indexIn<T>(prev: readonly T[], i: number, next: readonly T[], keyOf: (x: T) => unknown = (x) => x): number {
  if (i < 0 || i >= prev.length) return -1
  const k = keyOf(prev[i]!)
  return next.findIndex((x) => keyOf(x) === k)
}

/** 一覧が短くなったら、選んでいる位置を最後に寄せる */
export const clampSel = (i: number, n: number) => Math.max(0, Math.min(i, n - 1))

/**
 * 選んでいる行の追跡。一覧（rows）か位置（sel）が変わるたびに sync(rows, sel, anchor) を呼び、返った位置に置き換える。
 * - 一覧だけが変わった: 前に選んでいた行を新しい一覧で探す（無ければ最後に寄せる）
 * - 位置も同時に変えた（行を動かした・押した）: その位置のまま
 * - reset() のあと: 追わずにその位置のまま（並べ替え・別の一覧・★のみ表示の切り替え）
 */
export class SelectionFollow<T> {
  private prev: readonly T[] = []
  private last = -1
  private skip = false
  constructor(private readonly keyOf: (x: T) => unknown = (x) => x) {}

  /**
   * 次の一覧で追わない（先頭から選び直す）。状態（並べ替え・sel）を変えたあとに呼ぶ。その変更が描き直されたら
   * 効き目は切れる（一覧が変わらなかったときに、後の取得で追うのを止めたままにしないため）
   */
  reset(): void {
    this.skip = true
    queueMicrotask(() => {
      this.skip = false
    })
  }

  sync(rows: readonly T[], sel: number, anchor = -1): { sel: number; anchor: number } {
    let s = sel
    let a = anchor
    if (rows !== this.prev && !this.skip && sel === this.last) {
      const j = indexIn(this.prev, sel, rows, this.keyOf)
      if (j >= 0) s = j
      if (a >= 0) a = indexIn(this.prev, a, rows, this.keyOf)
    }
    if (rows !== this.prev) this.skip = false
    s = clampSel(s, rows.length)
    if (a >= rows.length) a = -1
    this.prev = rows
    this.last = s
    return { sel: s, anchor: a }
  }
}
