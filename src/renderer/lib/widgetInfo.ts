// ペインの種類の登録表（docs/design-dialogs.md §5）: 分類・小さなアイコン（16px）・線画の図（56×36）。
// 名前・説明・別名は i18n（widget.*・widgetDesc.*・widgetAlias.*）。WIDGETS と同じ種類をそろえることは tests/unit/registry/widget-info.test.ts が確かめる
import type { WidgetId } from '../stores/layout.svelte'

/** 分類の順（カードの格子の段の順。どの分類も 4 枚まで） */
export const WIDGET_GROUPS = ['view', 'compare', 'market', 'folio', 'other'] as const
export type WidgetGroup = (typeof WIDGET_GROUPS)[number]

/** 線画の図の 1 本（d と見た目の種類: fr 枠・fl 塗り・th 細い線・tk 太い線・dim 薄い） */
export type FigPath = readonly [d: string, cls?: 'fr' | 'fl' | 'th' | 'tk' | 'tk dim']
export interface WidgetInfo {
  group: WidgetGroup
  /** 24×24 の線のアイコン（コマンドバーの候補） */
  icon: string
  /** 56×36 の線画の図（ペインの形。データは描かない） */
  fig: readonly FigPath[]
}

const R = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`
const C = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
const FRAME: FigPath = [R(0.5, 0.5, 55, 35), 'fr']

/** 分類の中の並び（場所を覚えられるよう固定。絞り込んでも並びは変えない） */
export const WIDGET_INFO: Record<WidgetId, WidgetInfo> = {
  chart: {
    group: 'view',
    icon: 'M4 19h16M7 15V9M7 7V5M12 17v-3M12 8V5M17 13v-2M17 7V4M5.5 9h3v5h-3zM10.5 8h3v6h-3zM15.5 7h3v4h-3z',
    fig: [
      FRAME,
      ['M10 8v20M22 6v18M34 12v18M46 4v16'],
      [R(7, 12, 6, 10), 'fl'],
      [R(19, 9, 6, 9)],
      [R(31, 15, 6, 9), 'fl'],
      [R(43, 7, 6, 8)],
    ],
  },
  mtf: {
    group: 'view',
    icon: 'M4 4h16v4.5H4zM4 10h16v4.5H4zM4 16h16v4H4z',
    fig: [
      FRAME,
      ['M0.5 12.5h55M0.5 24.5h55'],
      ['M5 9l8-3 8 2 8-4 8 3 8-2 6 1'],
      ['M5 21l10-4 10 2 10-5 10 3 6-2'],
      ['M5 33l12-5 12 1 12-4 10 2'],
    ],
  },
  info: {
    group: 'view',
    icon: `${C(12, 12, 8)}M12 11v5M12 8v.01`,
    fig: [FRAME, ['M6 8h20M6 13h12'], ['M36 30V22M41 30V19M46 30V16M51 30V13'], ['M6 21h20M6 25h16M6 29h18', 'th']],
  },
  watchlist: {
    group: 'compare',
    icon: 'M9 6h11M9 12h11M9 18h11M4.5 4.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7L2 6.3l1.7-.2z',
    fig: [
      FRAME,
      ['m8 6.5 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L4.8 8.8 7 8.5z', 'fl'],
      ['M15 9h20M41 9h10M15 17h20M41 17h10M15 25h20M41 25h10'],
      ['M6 17h4M6 25h4', 'th'],
    ],
  },
  screener: {
    group: 'compare',
    icon: 'M4 5h16l-6 7v6l-4 2v-8z',
    fig: [
      FRAME,
      ['M8 5h11a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6zM25 5h13a3 3 0 0 1 0 6H25a3 3 0 0 1 0-6z'],
      ['M5 17h46M5 23h46M5 29h46', 'th'],
      ['M5 17h20'],
    ],
  },
  grid: {
    group: 'compare',
    icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    fig: [
      FRAME,
      ['M19 0.5v35M37 0.5v35M0.5 18h55'],
      ['M4 13l4-4 4 2 4-5M22 12l4 1 4-5 4 2M40 9l4 3 4-4 4 1M4 31l4-3 4 1 4-5M22 30l4-5 4 2 4-3M40 28l4 1 4-5 4 2'],
    ],
  },
  ranking: {
    group: 'compare',
    icon: 'M5 20V12M10 20V6M15 20v-9M20 20v-5',
    fig: [FRAME, ['M6 8h40M6 14h32M6 20h26M6 26h18M6 32h12', 'tk']],
  },
  heatmap: {
    group: 'market',
    icon: 'M4 4h9v10H4zM13 4h7v5h-7zM13 9h7v5h-7zM4 14h5v6H4zM9 14h11v6H9z',
    fig: [FRAME, ['M28 0.5v35M0.5 20h27.5M28 13h27.5M42 13v22.5M14 20v15.5M42 24h13.5'], [R(2, 2, 24, 16), 'fl'], [R(44, 26, 10, 8), 'fl']],
  },
  market: {
    group: 'market',
    icon: 'M4 18l4-5 4 3 4-7 4 4M4 4v16h16',
    fig: [FRAME, ['M28 0.5v35'], ['M4 28l5-6 5 3 5-9 5 4M32 22l5 3 5-8 5 2 5-6'], ['M4 31h20M32 31h20', 'th']],
  },
  board: {
    group: 'market',
    icon: 'M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14',
    fig: [
      FRAME,
      ['M0.5 9.5h55M0.5 18.5h55M0.5 27.5h55M20 0.5v35'],
      ['M4 5h10M4 14h12M4 23h9M4 32h11M38 5h14M40 14h12M36 23h16M42 32h10', 'th'],
    ],
  },
  breadth: {
    group: 'market',
    icon: 'M12 4v16M5 7h7v4H5zM12 13h6v4h-6z',
    fig: [FRAME, ['M28 4v28', 'th'], ['M28 8h-18M28 14h-12M28 20h-20M28 26h-8', 'tk'], ['M28 11h14M28 17h20M28 23h10M28 29h16', 'tk dim']],
  },
  portfolio: {
    group: 'folio',
    icon: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
    fig: [
      FRAME,
      ['M0.5 9.5h55'],
      ['M5 5h10M30 5h8M44 5h8', 'th'],
      ['M5 15h14M30 15h8M44 15h8M5 22h12M30 22h8M44 22h8M5 29h16M30 29h8M44 29h8'],
    ],
  },
  folio: {
    group: 'folio',
    icon: `${C(12, 12, 8)}M12 4v8l6 4`,
    fig: [FRAME, ['M4 30l6-6 6 2 6-8 6 3 6-9'], [C(46, 17, 7)], ['M46 10v7l6 3']],
  },
  divcal: {
    group: 'folio',
    icon: 'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4M8 14h2M14 14h2M8 17h2',
    fig: [FRAME, ['M0.5 9.5h55M14 9.5v26M28 9.5v26M42 9.5v26M0.5 22.5h55'], [C(21, 16, 2), 'fl'], [C(49, 29, 2), 'fl'], [C(7, 29, 2)]],
  },
  divsim: {
    group: 'folio',
    icon: 'M4 19h16M4 16c4-1 6-4 8-7s4-4 8-5',
    fig: [FRAME, ['M4 32h48', 'th'], ['M4 30c10-2 16-8 22-14s14-10 26-11'], ['M4 30c10 0 18-3 24-6s14-5 24-5', 'th']],
  },
  news: {
    group: 'other',
    icon: 'M4 5h13v14H4zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4',
    fig: [FRAME, [`${C(7, 8, 1.5)}${C(7, 16, 1.5)}${C(7, 24, 1.5)}${C(7, 32, 1.5)}`, 'fl'], ['M12 8h36M12 16h28M12 24h38M12 32h24']],
  },
  jobs: {
    group: 'other',
    icon: `M5 6h14M5 12h9M5 18h12${C(19, 12, 1.5)}`,
    fig: [FRAME, [R(5, 7, 46, 5)], [R(5, 7, 30, 5), 'fl'], [R(5, 17, 46, 5)], [R(5, 17, 12, 5), 'fl'], ['M5 29h30', 'th']],
  },
}
/** 分類ごとの並び（WIDGET_INFO の書いた順） */
export const WIDGET_ORDER = Object.keys(WIDGET_INFO) as WidgetId[]
