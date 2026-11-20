// 設定の既定値。Core（読み込み・欠けた項目の補い）と renderer（起動の前の表示）が同じものを使う
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja',
  candleStyle: 'jp',
  density: 'normal',
  uiScale: 1,
  retentionYears: 3,
  disclaimerAccepted: false,
  firstRunDone: false,
  userInstruments: [],
  reduceMotion: false,
  focusAlways: false,
  theme: 'dark',
  autoUpdate: true,
  checkUpdates: true,
  privacyMode: false,
  alertNotify: true,
  divGoal: 0,
  yieldLine: false,
  yieldTargets: [4],
  chartSave: false,
  closeToTray: false,
  keymap: {},
  recentFields: [],
  paletteRecent: [],
  maPeriods: { D: [5, 25, 75], W: [13, 26, 52], M: [12, 24, 60] },
}

/** 窓の地の色とタイトルバー（Windows の titleBarOverlay）の色。main が窓を作るときと、テーマを変えたときに使う */
export const THEME_COLORS = {
  dark: { background: '#0b0d10', titleBar: '#101318', symbol: '#a3adb9' },
  light: { background: '#e9ecf0', titleBar: '#ffffff', symbol: '#4a5562' },
} as const
export type Theme = keyof typeof THEME_COLORS

/**
 * 保存した設定のファイル（data/user/settings.json の中身）からテーマを読む。main が窓を作る前に使う（起動の最初からその色で出す。
 * ライトテーマで一度黒くなるのを防ぐ。NFR-Q3）。無い・壊れている・知らない値なら既定（ダーク）
 */
export function savedTheme(text: string | null): Theme {
  if (!text) return DEFAULT_SETTINGS.theme
  try {
    const raw = JSON.parse(text) as { data?: { theme?: unknown }; theme?: unknown }
    const t = raw.data?.theme ?? raw.theme
    return t === 'light' || t === 'dark' ? t : DEFAULT_SETTINGS.theme
  } catch {
    return DEFAULT_SETTINGS.theme
  }
}
