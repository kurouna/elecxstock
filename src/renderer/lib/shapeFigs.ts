// 選ぶダイアログの形の図（新しいページ・新しいウィンドウの初めの形。FR-L14・FR-L7）。ペインの種類の図（widgetInfo の fig）と同じ 56×36 の線画。
// 選択肢の ID（`preset:free`・`free:quad`・`grid`・`last`・`page:<ID>`）から図を引く。図の無い選択肢は今の 1 行のまま
import type { FigPath } from './widgetInfo'

const R = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`
const FRAME: FigPath = [R(0.5, 0.5, 55, 35), 'fr']
/** ペインの中のローソク足（小さく 3 本） */
const candles = (x: number, y: number, w: number, h: number): FigPath => {
  const s = w / 4
  const m = y + h / 2
  return [`M${x + s} ${m - h * 0.3}v${h * 0.5}M${x + 2 * s} ${m - h * 0.15}v${h * 0.45}M${x + 3 * s} ${m - h * 0.35}v${h * 0.4}`]
}

export const SHAPE_FIG = {
  /** マイレイアウトの初めの並び: 左のドロワー（一覧）とチャート 4 枚 */
  free: [
    FRAME,
    [R(3, 3, 12, 30)],
    ['M5 9h8M5 14h8M5 19h6', 'th'],
    [R(18, 3, 35, 30)],
    ['M35.5 3v30M18 18h35'],
    candles(18, 4, 17, 13),
    candles(36, 4, 17, 13),
    candles(18, 19, 17, 13),
    candles(36, 19, 17, 13),
  ],
  /** 空: チャート 1 枚 */
  empty: [FRAME, [R(3, 3, 50, 30)], candles(10, 6, 36, 24)],
  /** 4 分割 */
  quad: [
    FRAME,
    [R(3, 3, 50, 30)],
    ['M28 3v30M3 18h50'],
    candles(3, 4, 25, 13),
    candles(28, 4, 25, 13),
    candles(3, 19, 25, 13),
    candles(28, 19, 25, 13),
  ],
  /** チャートグリッド: 小さなタイルの格子 */
  grid: [
    FRAME,
    [R(3, 3, 50, 30)],
    ['M14.5 3v30M26 3v30M37.5 3v30M3 12.5h50M3 23h50'],
    ['M5 9l3-2 3 1M16.5 9l3 1 3-3M28 8l3 1 3-2M39.5 10l3-3 3 1M5 19l3 1 3-3M16.5 18l3-2 3 1M28 20l3-3 3 1M39.5 19l3 1 3-2', 'th'],
  ],
  /** 詳細: マルチ時間軸（3 枚）と銘柄情報 */
  detail: [
    FRAME,
    [R(3, 3, 50, 30)],
    ['M38 3v30M3 13h35M3 23h35'],
    candles(3, 3, 35, 10),
    candles(3, 13, 35, 10),
    candles(3, 23, 35, 10),
    ['M41 7h10M41 12h8M41 17h10M41 22h6M41 27h9', 'th'],
  ],
  /** 比較: 左にパフォーマンス比較（基準の線から 3 本の線と右端の点）、右に日足のチャート */
  perf: [
    FRAME,
    [R(3, 3, 32, 30)],
    ['M5 20h28', 'th'],
    ['M5 20l6-3 6 1 6-6 7-4M5 20l6 2 6-2 6 1 7-1M5 20l6 4 6 3 6-1 7 4'],
    ['M30 8v.01M30 20v.01M30 27v.01', 'tk'],
    [R(38, 3, 15, 30)],
    candles(38, 6, 15, 24),
  ],
  /** マイレイアウトのページの写し: 重なった 2 枚 */
  page: [FRAME, [R(12, 8, 26, 22), 'th'], [R(18, 5, 26, 22)], ['M22 12h14M22 17h18M22 22h10', 'th']],
  /** 前回の配置: 枠と、戻る矢印 */
  last: [FRAME, [R(3, 3, 50, 30), 'th'], ['M34 18a6 6 0 1 1-2-4.5M32 9v4.5h-4.5']],
} as const satisfies Record<string, readonly FigPath[]>
export type ShapeFig = keyof typeof SHAPE_FIG

/** 選択肢の ID から図（無ければ undefined） */
export function shapeFigOf(id: string): ShapeFig | undefined {
  if (id.startsWith('page:')) return 'page'
  const k = id.replace(/^(preset|free):/, '')
  return Object.hasOwn(SHAPE_FIG, k) ? (k as ShapeFig) : undefined
}
