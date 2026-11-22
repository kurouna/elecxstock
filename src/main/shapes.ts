// フリー N を開くときの初期の形の許可リスト（マルチモニタ・FR-L14）。renderer から届いた値をそのまま URL に載せないための純関数
const SHAPES = ['grid', 'quad', 'detail', 'empty', 'perf']
/** マイレイアウトのページの写し（`page:<ページの ID>`） */
const PAGE = /^page:[\w-]{1,40}$/

/** 初期の形として受け取る値。知らない値と `last`（前回の配置）は undefined（前回の配置で開く） */
export function freeShapeArg(shape: unknown): string | undefined {
  if (typeof shape !== 'string') return undefined
  return SHAPES.includes(shape) || PAGE.test(shape) ? shape : undefined
}
