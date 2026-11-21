// 設定の画面の項目の登録表と判定（docs/design-dialogs.md §6。FR-KB11）。探す・既定に戻す・変えた数はこれで決める。
// Settings のどの項目も、画面の行にちょうど 1 回出るか NOT_ON_SCREEN に理由を書く（tests/unit/registry/settings-spec.test.ts）
import { type Match, rankBy } from '@shared/match'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { Settings } from '@shared/types'
import { ACTION_GROUPS, type ActionGroup } from './palette'

export const SETTING_TABS = ['general', 'display', 'chart', 'data', 'keys', 'news', 'about'] as const
export type SettingTab = (typeof SETTING_TABS)[number]

export type RowKind =
  | 'seg'
  | 'switch'
  | 'login'
  | 'loginHidden'
  | 'theme'
  | 'scale'
  | 'density'
  | 'candle'
  | 'yield'
  | 'retention'
  | 'chips'
  | 'buttons'
  | 'stats'
  | 'app'
  | 'info'
  | 'tablink'
export interface SettingRow {
  id: string
  tab: SettingTab
  /** 節（i18n の setsec.*） */
  section: string
  /** 名前・説明・別名（i18n のキー。別名は , で分ける） */
  label: string
  desc?: string
  alias?: string
  kind: RowKind
  /** Settings の項目（既定に戻す・変えた数の対象）。無い行は数えない */
  setting?: keyof Settings
  /** 既定に戻せない（利用者のデータの一覧など） */
  noReset?: boolean
  /** この行がオンのときだけ使える */
  dependsOn?: string
  /** 危険な操作（赤い枠の節） */
  danger?: boolean
}

const R = (tab: SettingTab, section: string, id: string, kind: RowKind, o: Partial<SettingRow> = {}): SettingRow => ({
  id,
  tab,
  section,
  label: `set.${id}`,
  kind,
  ...o,
})
export const SETTING_ROWS: readonly SettingRow[] = [
  // ---- 一般
  // 言語は好みの違いで「既定から変えた」ものではない（英語の利用者にいつも印を出さない）
  R('general', 'lang', 'lang', 'seg', { setting: 'lang', noReset: true, desc: 'set.langDesc', alias: 'set.langAlias' }),
  R('general', 'startup', 'closeToTray', 'switch', { setting: 'closeToTray', desc: 'set.closeToTrayHint' }),
  R('general', 'startup', 'loginStart', 'login', { desc: 'set.loginStartDesc', alias: 'set.loginStartAlias' }),
  R('general', 'startup', 'startHidden', 'loginHidden', { desc: 'set.startHiddenHint', dependsOn: 'loginStart' }),
  R('general', 'updates', 'autoUpdate', 'switch', { setting: 'autoUpdate', desc: 'set.autoUpdateHint' }),
  R('general', 'updates', 'alertNotify', 'switch', { setting: 'alertNotify', desc: 'set.alertNotifyDesc' }),
  R('general', 'updates', 'checkUpdates', 'switch', { setting: 'checkUpdates', desc: 'set.checkUpdatesDesc' }),
  // ---- 表示
  R('display', 'theme', 'theme', 'theme', { setting: 'theme', desc: 'set.themeDesc', alias: 'set.themeAlias' }),
  R('display', 'text', 'scale', 'scale', { setting: 'uiScale', desc: 'set.scaleDesc', alias: 'set.scaleAlias' }),
  R('display', 'text', 'density', 'density', { setting: 'density', desc: 'set.densityDesc' }),
  R('display', 'color', 'candle', 'candle', { setting: 'candleStyle', desc: 'set.candleDesc', alias: 'set.candleAlias' }),
  R('display', 'motion', 'motion', 'switch', { setting: 'reduceMotion', desc: 'set.motionDesc', alias: 'set.motionAlias' }),
  R('display', 'motion', 'focusAlways', 'switch', { setting: 'focusAlways', desc: 'set.focusAlwaysHint' }),
  R('display', 'layout', 'resetAllLayouts', 'buttons', { desc: 'set.resetAllLayoutsDesc' }),
  // ---- チャート
  R('chart', 'yield', 'yieldLine', 'switch', { setting: 'yieldLine', desc: 'set.yieldLineHint', alias: 'set.yieldAlias' }),
  R('chart', 'yield', 'yieldTargets', 'yield', {
    setting: 'yieldTargets',
    desc: 'set.yieldTargetsDesc',
    alias: 'set.yieldAlias',
    dependsOn: 'yieldLine',
  }),
  R('chart', 'image', 'chartSave', 'switch', { setting: 'chartSave', desc: 'set.chartSaveHint', alias: 'set.chartSaveAlias' }),
  // ---- データ
  R('data', 'status', 'status', 'stats'),
  R('data', 'storage', 'retention', 'retention', { setting: 'retentionYears', desc: 'set.retentionDesc', alias: 'set.retentionAlias' }),
  R('data', 'symbols', 'universe', 'buttons', { desc: 'set.universeDesc', alias: 'set.universeAlias' }),
  R('data', 'symbols', 'userInstruments', 'chips', {
    setting: 'userInstruments',
    noReset: true,
    desc: 'set.userInstrumentsHint',
    alias: 'set.userInstrumentsAlias',
  }),
  R('data', 'backup', 'userData', 'buttons', { desc: 'set.userDataDesc', alias: 'set.userDataAlias' }),
  R('data', 'backup', 'backupDb', 'buttons', { desc: 'set.backupDbDesc' }),
  R('data', 'backup', 'logs', 'buttons', { desc: 'set.logsDesc', alias: 'set.logsAlias' }),
  R('data', 'danger', 'reset', 'buttons', { desc: 'set.resetDesc', danger: true }),
  // ---- キー・ニュース: 中身は専用の画面。探したときに、そのタブへ移る行だけを持つ（§6「全タブから探す」）
  R('keys', 'keys', 'keysTab', 'tablink', { label: 'act.keys', desc: 'set.sub.keys', alias: 'set.keysAlias' }),
  R('news', 'news', 'newsTab', 'tablink', { label: 'set.news', desc: 'set.sub.news', alias: 'set.newsAlias' }),
  // ---- このアプリについて
  R('about', 'app', 'app', 'app'),
  R('about', 'license', 'usage', 'info', { label: 'set.usageLabel', desc: 'set.usageDesc', alias: 'set.usageAlias' }),
  R('about', 'license', 'licenseLabel', 'info', { desc: 'set.license' }),
  R('about', 'license', 'dataLabel', 'info'),
  R('about', 'license', 'chartsLabel', 'info'),
  R('about', 'license', 'notices', 'buttons', { desc: 'set.noticesDesc' }),
]

/** Settings の項目のうち、設定の画面に行を持たないもの（と、その理由） */
export const NOT_ON_SCREEN: Record<string, string> = {
  disclaimerAccepted: '初回起動の免責の同意（初回の画面）',
  firstRunDone: '初回起動を終えたか（初回の画面）',
  privacyMode: 'プライバシーモード（Ctrl+Shift+H とトップバーのボタン）',
  divGoal: '配当の目標（ポートフォリオのペインとコマンドバー）',
  keymap: 'キーの割り当て（キーのタブ。行ごとに既定に戻す）',
  recentFields: '条件を選ぶダイアログの「よく使う」（利用者が選ぶ設定ではない）',
  paletteRecent: 'コマンドバーの最近使ったもの（利用者が選ぶ設定ではない）',
  maPeriods: '移動平均の期間（チャートの指標のメニュー）',
}

export const rowById = (id: string) => SETTING_ROWS.find((r) => r.id === id)
export const rowsOfTab = (tab: SettingTab) => SETTING_ROWS.filter((r) => r.tab === tab)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** 既定から変えたか（既定に戻せる行だけ） */
export function isModified(row: SettingRow, s: Settings): boolean {
  if (!row.setting || row.noReset) return false
  return !same(s[row.setting], DEFAULT_SETTINGS[row.setting])
}
/** タブごとの既定から変えた数（キーのタブは、割り当てを変えた実在するアクションの数。actionIds が無ければすべて） */
export function modifiedCount(tab: SettingTab, s: Settings, actionIds?: readonly string[]): number {
  if (tab === 'keys') return Object.keys(s.keymap).filter((id) => !actionIds || actionIds.includes(id)).length
  return rowsOfTab(tab).filter((r) => isModified(r, s)).length
}
/** 既定の値（既定に戻す） */
export const defaultOf = <K extends keyof Settings>(k: K): Settings[K] => structuredClone(DEFAULT_SETTINGS[k])

/** 探せない行（値を持たない表示だけの行） */
const UNSEARCHABLE = new Set<RowKind>(['stats', 'app'])
/** 全タブから探す（名前・説明・別名・節の名前）。点数の順、同じ点数は登録表の順 */
export function searchSettings(q: string, tr: (k: string) => string): { row: SettingRow; ranges: Match['ranges'] }[] {
  if (!q.trim()) return []
  const rows = SETTING_ROWS.filter((r) => !UNSEARCHABLE.has(r.kind))
  return (
    rankBy(
      q,
      rows,
      (r) => tr(r.label),
      (r) => [tr(r.desc ?? ''), tr(`setsec.${r.section}`), ...tr(r.alias ?? '').split(',')].filter(Boolean),
    )
      .map(({ item, m }) => ({ row: item, ranges: m.ranges }))
      // タブの順に並べ直す（タブごとの枠にまとめる。タブの中は点数の順のまま）
      .sort((a, b) => SETTING_TABS.indexOf(a.row.tab) - SETTING_TABS.indexOf(b.row.tab))
  )
}

/** 表示倍率の段（FR-V10） */
export const SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const
/** 日足の保存期間の年（FR-D6） */
export const RETENTION_YEARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
/** 並びの中で前後へ（端で止まる。並びに無い値は近いものから） */
export function stepIn<T extends number>(list: readonly T[], cur: number, d: 1 | -1): T {
  let i = list.indexOf(cur as T)
  if (i < 0) {
    // 並びに無い値: d の方向で最初に越えるもの
    const j = d > 0 ? list.findIndex((x) => x > cur) : list.findLastIndex((x) => x < cur)
    return list[j < 0 ? (d > 0 ? list.length - 1 : 0) : j]!
  }
  i = Math.max(0, Math.min(list.length - 1, i + d))
  return list[i]!
}
/** 保存期間を変えたときの DB の容量の見込み（今の容量を年で割って掛ける。おおよそ） */
export function retentionEstimate(dbBytes: number, curYears: number, years: number): { mb: number; deltaMb: number } {
  const cur = dbBytes / 2 ** 20
  const mb = curYears > 0 ? Math.round((cur / curYears) * years) : 0
  return { mb, deltaMb: mb - Math.round(cur) }
}
/** セグメントの ← →: 前後の選択肢（端で止まる）。ほかのキーは null */
export function segStep<T>(opts: readonly T[], cur: T, key: string): T | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const i = opts.indexOf(cur)
  return opts[Math.max(0, Math.min(opts.length - 1, i + (key === 'ArrowRight' ? 1 : -1)))]!
}
/** 続いた同じキーの行を 1 つの節に（タブの中は節、探すときはタブ） */
export function groupRows<T>(items: readonly T[], key: (x: T) => string): { key: string; items: T[] }[] {
  const out: { key: string; items: T[] }[] = []
  for (const x of items) {
    const k = key(x)
    const last = out[out.length - 1]
    if (last && last.key === k) last.items.push(x)
    else out.push({ key: k, items: [x] })
  }
  return out
}
/** 「既定: …」に出す既定の値の書き方 */
export function defaultText(k: keyof Settings, tr: (k: string, a?: Record<string, string | number>) => string): string {
  const v = DEFAULT_SETTINGS[k]
  if (typeof v === 'boolean') return tr(v ? 'set.on' : 'set.off')
  if (k === 'lang') return v === 'ja' ? '日本語' : 'English'
  if (k === 'theme') return tr(v === 'dark' ? 'set.dark' : 'set.light')
  if (k === 'density') return tr(v === 'normal' ? 'set.normal' : 'set.compact')
  if (k === 'candleStyle') return tr(v === 'jp' ? 'set.jpShort' : 'set.usShort')
  if (k === 'uiScale') return `${Math.round((v as number) * 100)}%`
  if (k === 'retentionYears') return tr('set.years', { n: v as number })
  if (k === 'yieldTargets') return (v as number[]).map((x) => `${x}%`).join(' · ')
  return ''
}
/** キーの割り当ての一覧の行: 名前・キー・分類の名前で探し、変えたものだけにも絞る。アクションの分類の順（コマンドバーと同じ） */
export function keyRows<A extends { id: string; label: string; key: string; group: ActionGroup }>(
  acts: readonly A[],
  o: { q: string; onlyChanged: boolean; keymap: Record<string, string>; groupName?: (g: ActionGroup) => string },
): { a: A; ranges: Match['ranges'] }[] {
  const list = acts.filter((a) => !o.onlyChanged || a.id in o.keymap)
  const hits = o.q.trim()
    ? rankBy(
        o.q,
        list,
        (a) => a.label,
        (a) => [a.key, a.key.replace(/\+/g, ' '), o.groupName?.(a.group) ?? ''],
      )
    : list.map((a) => ({ item: a, m: { score: 0, ranges: [] as Match['ranges'] } }))
  return hits
    .map(({ item, m }) => ({ a: item, ranges: m.ranges }))
    .sort((x, y) => ACTION_GROUPS.indexOf(x.a.group) - ACTION_GROUPS.indexOf(y.a.group))
}

/** 容量の差の書き方（+120・−5・0） */
export const signedMb = (d: number) => (d > 0 ? `+${d.toLocaleString()}` : d < 0 ? `−${Math.abs(d).toLocaleString()}` : '0')
/** 依存する行が今は使えないか（サインイン時の起動は Windows の登録 loginOn、ほかは相手の行の設定） */
export function dependencyOff(row: SettingRow, s: Settings, loginOn: boolean): boolean {
  if (!row.dependsOn) return false
  if (row.dependsOn === 'loginStart') return !loginOn
  const k = rowById(row.dependsOn)?.setting
  return k ? !s[k] : false
}
/** 行の種類の性質: wide は操作を名前の下に置く（見本の付いた行）、valued は ← → で値を変える（← でタブへ戻らない） */
export const KIND: Record<RowKind, { wide: boolean; valued: boolean }> = {
  seg: { wide: false, valued: true },
  switch: { wide: false, valued: false },
  login: { wide: false, valued: false },
  loginHidden: { wide: false, valued: false },
  theme: { wide: true, valued: true },
  scale: { wide: true, valued: true },
  density: { wide: false, valued: true },
  candle: { wide: true, valued: true },
  yield: { wide: true, valued: false },
  retention: { wide: false, valued: true },
  chips: { wide: true, valued: false },
  buttons: { wide: false, valued: false },
  stats: { wide: false, valued: false },
  app: { wide: false, valued: false },
  info: { wide: true, valued: false },
  tablink: { wide: false, valued: false },
}
/** バイトを MB で（区切りつき） */
export const fmtMb = (bytes: number | undefined) => Math.round((bytes ?? 0) / 1048576).toLocaleString()
const TOGGLE_KINDS: readonly RowKind[] = ['switch', 'login', 'loginHidden']
const VALUE_KINDS = (Object.keys(KIND) as RowKind[]).filter((k) => KIND[k].valued)
/** 行の中の部品の様子（DOM から読む。↺・隠れた部品・使えない部品・読むだけの欄・Tab で止まらない部品は除く） */
export interface PartInfo {
  reset: boolean
  ariaHidden: boolean
  disabled: boolean
  readOnly: boolean
  tabIndex: number
  shown: boolean
}
/** ← → で巡る行の中の部品か（目標利回りの線がオフの欄は読むだけ・tabindex -1 なので部品にせず、行そのものに止まる） */
export const isRowPart = (p: PartInfo) => !p.reset && !p.ariaHidden && !p.disabled && !p.readOnly && p.tabIndex >= 0 && p.shown
/** 下の段に出す操作の案内（そのタブにある部品の操作だけ） */
export function footHints(tab: SettingTab): { toggle: boolean; value: boolean; reset: boolean } {
  const rows = rowsOfTab(tab)
  return {
    toggle: rows.some((r) => TOGGLE_KINDS.includes(r.kind)),
    value: rows.some((r) => VALUE_KINDS.includes(r.kind)),
    reset: rows.some((r) => r.setting != null && !r.noReset),
  }
}
