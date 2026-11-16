// ウィンドウの位置の記憶と戻し（マルチモニタ、docs/design-multimonitor.md §5）。純粋関数（Electron を import しない）。
// ディスプレイの id や名前は使わない（ドッキング・ドライバで変わる）。全ディスプレイの組み合わせごとに位置を覚える。

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export interface DisplayLike {
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}
export interface Placement {
  bounds: Rect
  maximized: boolean
  fullScreen?: boolean
}
/** window.json 版 2: 組み合わせ → スロット → 位置。open は終了時に開いていたフリー N */
export interface WindowStateV2 {
  version: 2
  topo: Record<string, Record<string, Placement>>
  open: string[]
  /** スロットごとの表示倍率（このウィンドウの文字の大きさ、R2） */
  zoom?: Record<string, number>
  /** 通知領域にしまったときの案内（Windows の通知）を出した（FR-BG2。一度だけ出す） */
  trayHint?: boolean
}

/** ディスプレイの組み合わせの印（並び順に依らない） */
export function topologyOf(displays: DisplayLike[]): string {
  return displays
    .map((d) => `${d.bounds.x},${d.bounds.y},${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}`)
    .sort()
    .join('|')
}

/** 位置がどれかのディスプレイの作業領域で十分に見えるか（タイトルの帯をつかめる） */
export function visibleOn(displays: DisplayLike[], r: Rect): boolean {
  return displays.some((d) => {
    const a = d.workArea
    return r.x < a.x + a.width - 100 && r.x + r.width > a.x + 100 && r.y >= a.y - 20 && r.y < a.y + a.height - 100
  })
}

/**
 * 開く位置を決める。今の組み合わせの記録があればそれ（見えるときだけ）、無ければ fallback。
 * fallback はフリー N なら「主ディスプレイでない画面」の中央、無ければ主ディスプレイの中央
 */
export function place(
  displays: DisplayLike[],
  primary: DisplayLike,
  state: WindowStateV2,
  slot: string,
  size: { width: number; height: number },
): Placement {
  const saved = state.topo[topologyOf(displays)]?.[slot]
  if (saved && visibleOn(displays, saved.bounds)) return saved
  const target = slot === 'main' ? primary : (displays.find((d) => d !== primary && !sameRect(d.bounds, primary.bounds)) ?? primary)
  const a = target.workArea
  const width = Math.min(size.width, a.width)
  const height = Math.min(size.height, a.height)
  // 同じ画面に重ねて開くときは少しずらす（主の真上に隠れないように）
  const shift = target === primary && slot !== 'main' ? 40 * (Number(slot.replace(/\D/g, '')) || 1) : 0
  return {
    bounds: { x: Math.round(a.x + (a.width - width) / 2 + shift), y: Math.round(a.y + (a.height - height) / 2 + shift), width, height },
    maximized: false,
  }
}

/** 位置を記録する（今の組み合わせだけを書き換え、ほかの組み合わせの記録は残す） */
export function remember(state: WindowStateV2, displays: DisplayLike[], slot: string, p: Placement): WindowStateV2 {
  const key = topologyOf(displays)
  return { ...state, topo: { ...state.topo, [key]: { ...(state.topo[key] ?? {}), [slot]: p } } }
}

/** window.json を読む（版 1 の 1 件の形も、今の組み合わせの主ウィンドウとして読む） */
export function parseState(raw: unknown, displays: DisplayLike[]): WindowStateV2 {
  const empty: WindowStateV2 = { version: 2, topo: {}, open: [] }
  if (!raw || typeof raw !== 'object') return empty
  const o = raw as Record<string, unknown>
  if (o.version === 2 && o.topo && typeof o.topo === 'object') {
    return {
      version: 2,
      topo: o.topo as WindowStateV2['topo'],
      open: Array.isArray(o.open) ? (o.open as unknown[]).filter((x): x is string => typeof x === 'string' && /^free[2-4]$/.test(x)) : [],
      ...(o.zoom && typeof o.zoom === 'object' ? { zoom: o.zoom as Record<string, number> } : {}),
      ...(o.trayHint === true ? { trayHint: true } : {}),
    }
  }
  if (typeof o.width === 'number' && typeof o.height === 'number') {
    const bounds = { x: Number(o.x ?? 0), y: Number(o.y ?? 0), width: o.width, height: o.height }
    return remember(empty, displays, 'main', { bounds, maximized: !!o.maximized })
  }
  return empty
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
