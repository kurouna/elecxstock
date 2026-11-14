// 設定の既定値。Core（読み込み・欠けた項目の補い）と renderer（起動の前の表示）が同じものを使う
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja',
  candleStyle: 'jp',
  density: 'normal',
  uiScale: 1,
  retentionYears: 5,
  disclaimerAccepted: false,
  firstRunDone: false,
  userInstruments: [],
  reduceMotion: false,
  focusAlways: false,
  theme: 'dark',
  autoUpdate: true,
  checkUpdates: true,
  alertNotify: true,
  keymap: {},
  recentFields: [],
  maPeriods: { D: [5, 25, 75], W: [13, 26, 52], M: [12, 24, 60] },
}
