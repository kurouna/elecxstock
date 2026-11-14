// 起動の前に書くレイアウト（userData/data/user/layout.json）。キーで準備するより安いときに使う。
// 読んだ側は normalizeDoc を通すので、ID は一意であればよい
let n = 0
const nid = () => `e2e${(++n).toString(36)}`

export type Node =
  | { kind: 'pane'; id: string; widget: string; link: number; state: Record<string, unknown> }
  | { kind: 'split'; id: string; dir: 'row' | 'col'; sizes: number[]; children: Node[] }

export const pane = (widget: string, state: Record<string, unknown> = {}, link = 1): Node => ({
  kind: 'pane',
  id: nid(),
  widget,
  link,
  state,
})
/** 横に並べる（左から右） */
export const row = (...children: Node[]): Node => ({
  kind: 'split',
  id: nid(),
  dir: 'row',
  sizes: children.map(() => 100 / children.length),
  children,
})
/** 縦に積む（上から下） */
export const col = (...children: Node[]): Node => ({
  kind: 'split',
  id: nid(),
  dir: 'col',
  sizes: children.map(() => 100 / children.length),
  children,
})

export type LayoutDoc = {
  version: number
  active: string
  entries: Record<string, { root: Node; docks: Record<string, unknown> }>
  links: Record<string, unknown>
}

/** 「フリー」のタブを root にして開いた状態にする（ドロワーは無し） */
export const freeTab =
  (root: Node) =>
  (doc: LayoutDoc): void => {
    doc.entries.free = { root, docks: {} }
    doc.active = 'free'
  }
