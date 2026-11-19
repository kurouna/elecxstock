// チャートグリッド（ChartGrid.svelte）の選択と並べ替えの判定（FR-G7・G10）。.svelte に判定を書かないため、ここに出す（L1）

/**
 * 操作の対象のタイルの銘柄。拡大中（zoom）は拡大している銘柄（見えているのは 1 枚だけで、sel は拡大する前の位置のまま）、
 * それ以外は選んでいるタイル
 */
export function gridTarget<T extends string>(zoom: T | null, shown: readonly T[], sel: number): T | undefined {
  return zoom ?? shown[sel]
}

/**
 * Alt+← → の並べ替え（FR-G10）: 見えている並び（codes。★・◆で絞り込んでいれば絞った並び）の at 番目を、隣（d = −1 / +1）と
 * 入れ替えた「このグリッドの銘柄」（own）と、動かした先の見えている並びでの位置。隣が無ければ null。
 * 位置は own ではなく codes で数え、own の中は銘柄で探す（絞り込み中に別の銘柄を入れ替えない）
 */
export function swapInOwn<T extends string>(
  own: readonly T[],
  codes: readonly T[],
  at: number,
  d: -1 | 1,
): { own: T[]; at: number } | null {
  const a = codes[at]
  const b = codes[at + d]
  if (a == null || b == null) return null
  const i = own.indexOf(a)
  const j = own.indexOf(b)
  if (i < 0 || j < 0) return null
  const next = [...own]
  next[i] = b
  next[j] = a
  return { own: next, at: at + d }
}

/** 見えている並びの位置 → ページと、そのページの中の位置 */
export function pageOf(at: number, perPage: number): { page: number; sel: number } {
  const n = Math.max(1, perPage)
  return { page: Math.floor(at / n), sel: at % n }
}

/** 上限のある並びに足す（マーケットの小さなチャート。FR-U6）: 足した・もうある・いっぱい（足さない） */
export function appendLimited<T>(ids: readonly T[], id: T, max: number): { ids: T[]; result: 'added' | 'exists' | 'full' } {
  if (ids.includes(id)) return { ids: [...ids], result: 'exists' }
  if (ids.length >= max) return { ids: [...ids], result: 'full' }
  return { ids: [...ids, id], result: 'added' }
}

/**
 * タイルを外したあと（Delete・タイルの ✕。FR-G10）の拡大と選択: 拡大していた銘柄を外したら格子に戻る（選んでいた位置は保つ）。
 * 拡大していなければ 1 つ前のタイルを選ぶ。どちらも、外したあとにページに残ったタイルの数（left）の範囲に収める
 * （拡大中に末尾のタイルを外したとき、格子に戻って範囲の外を選んだままにしない）
 */
export function afterRemove<T>(zoom: T | null, removed: T, sel: number, left: number): { zoom: T | null; sel: number } {
  const inRange = (i: number) => Math.max(0, Math.min(i, left - 1))
  if (zoom != null && zoom === removed) return { zoom: null, sel: inRange(sel) }
  return { zoom, sel: inRange(sel - 1) }
}

/**
 * タイル・★・◆をクリックしたときの選択（FR-G7）。拡大中は見えているのが 1 枚だけ（位置は 0）なので、拡大する前の位置を保つ
 * （Esc で格子に戻ったとき、選択が先頭へ飛ばない）
 */
export function selOnClick(zoom: unknown, sel: number, i: number): number {
  return zoom != null ? sel : i
}

/**
 * このグリッドの銘柄（own）の at 番目を id に差し替える（C キー・一覧の行を落とす。FR-G10）。同じ銘柄は 1 つだけ残す。
 * at が own の外（拡大中に落として own に入っていない銘柄など）や、同じ銘柄なら差し替えない（null。ほかのタイルを消さない）
 */
export function replaceInOwn<T>(own: readonly T[], at: number, id: T): { own: T[]; old: T } | null {
  if (at < 0 || at >= own.length || own[at] === id) return null
  const old = own[at]!
  const next = [...own]
  next[at] = id
  return { own: next.filter((x, k) => x !== id || k === at), old }
}

/** own から id を外した並び。own に無ければ null（外したと知らせない） */
export function removeFromOwn<T>(own: readonly T[], id: T): T[] | null {
  return own.includes(id) ? own.filter((x) => x !== id) : null
}
