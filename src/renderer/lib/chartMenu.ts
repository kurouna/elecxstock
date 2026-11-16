// チャートの表示の操作（§6.5.4）: C 銘柄を変える・L 対数軸・A 価格の調整・T 種類・I 指標メニュー（指標・移動平均の期間・比較・表示期間をそろえる）。
// chart と mtf-chart が同じものを使う。表示はペインの状態に保存する（FR-L4）。
import type { Adjustment, InstrumentId } from '@shared/types'
import type { MoreItem } from '../components/PaneHeader.svelte'
import type { ChartType, Indicator } from '../components/widgets/ChartView.svelte'
import { app, checklistDialog, choiceDialog, nameOf, promptDialog, saveSettings, t, toast } from '../stores/app.svelte'
import { type PaneNode, paneSymbol, patchState } from '../stores/layout.svelte'
import type { Key } from './i18n'
import { PERIODS, periodOfKey } from './periods'

const IND: Indicator[] = ['ma', 'vol', 'volma', 'bb', 'ichimoku', 'rsi', 'macd', 'stoch', 'divs']
const TYPES: ChartType[] = ['candle', 'bar', 'line']
export const indicatorsOf = (pane: PaneNode) => (pane.state.ind as Indicator[] | undefined) ?? ['ma', 'vol', 'divs']

/** 比較する銘柄をコマンドバーで選んでいるペイン（receive で受け取る） */
let comparing: string | null = null
export function takeCompare(pane: PaneNode, id: InstrumentId): boolean {
  if (comparing !== pane.id) return false
  comparing = null
  const cur = (pane.state.cmp as InstrumentId[] | undefined) ?? []
  if (cur.includes(id)) return true
  if (cur.length >= 5) {
    toast(t('chart.cmpMax'))
    return true
  }
  patchState(pane, { cmp: [...cur, id] })
  toast(t('chart.cmpAdded', { name: nameOf(id) }))
  return true
}
export function cancelCompare(): void {
  comparing = null
}

export async function chartMenu(pane: PaneNode): Promise<void> {
  const cmp = (pane.state.cmp as InstrumentId[] | undefined) ?? []
  const choice = await choiceDialog(t('chart.menu'), [
    {
      id: 'ind',
      label: t('chart.menuInd'),
      hint: indicatorsOf(pane)
        .map((x) => t(`ind.${x}` as Key))
        .join('・'),
    },
    { id: 'type', label: t('chart.menuType'), hint: `${t(`ctype.${(pane.state.ctype as string) ?? 'candle'}` as Key)} (T)` },
    {
      id: 'ma',
      label: t('chart.menuMa'),
      hint: (['D', 'W', 'M'] as const).map((x) => `${x} ${app.settings.maPeriods[x].join('/')}`).join(' · '),
    },
    { id: 'cmp', label: t('chart.menuCmp'), hint: cmp.map((c) => nameOf(c)).join(', ') },
    ...(cmp.length ? [{ id: 'cmpClear', label: t('chart.menuCmpClear') }] : []),
    { id: 'sync', label: t('chart.menuSync'), hint: pane.state.syncRange ? 'ON' : 'OFF' },
  ])
  if (choice === 'ind') {
    const on = new Set(indicatorsOf(pane))
    const r = await checklistDialog(
      t('chart.menuInd'),
      IND.map((x) => ({ id: x, label: t(`ind.${x}` as Key), on: on.has(x) })),
    )
    if (r) patchState(pane, { ind: r.filter((x) => x.on).map((x) => x.id) })
  } else if (choice === 'type') {
    const c = await choiceDialog(
      t('chart.menuType'),
      TYPES.map((x) => ({ id: x, label: t(`ctype.${x}` as Key) })),
    )
    if (c) patchState(pane, { ctype: c })
  } else if (choice === 'ma') {
    const tf = await choiceDialog(t('chart.menuMa'), [
      { id: 'D', label: t('chart.daily'), hint: app.settings.maPeriods.D.join(', ') },
      { id: 'W', label: t('chart.weekly'), hint: app.settings.maPeriods.W.join(', ') },
      { id: 'M', label: t('chart.monthly'), hint: app.settings.maPeriods.M.join(', ') },
      { id: 'reset', label: t('chart.maReset') },
    ])
    if (!tf) return
    if (tf === 'reset') return saveSettings({ maPeriods: { D: [5, 25, 75], W: [13, 26, 52], M: [12, 24, 60] } })
    const k = tf as 'D' | 'W' | 'M'
    const s = await promptDialog(t('chart.maPrompt'), app.settings.maPeriods[k].join(', '))
    if (s == null) return
    const ns = s
      .split(/[,，、\s]+/)
      .map((x) => Math.floor(Number(x)))
      .filter((x) => x >= 2 && x <= 400)
    if (ns.length !== 3) {
      toast(t('chart.maInvalid'))
      return
    }
    saveSettings({ maPeriods: { ...app.settings.maPeriods, [k]: ns } })
  } else if (choice === 'cmp') {
    comparing = pane.id
    app.overlay = { kind: 'palette', q: '', title: t('chart.cmpTitle') }
  } else if (choice === 'cmpClear') patchState(pane, { cmp: [] })
  else if (choice === 'sync') {
    patchState(pane, { syncRange: !pane.state.syncRange })
    toast(`${t('chart.menuSync')}: ${pane.state.syncRange ? 'ON' : 'OFF'}`)
  }
}

/** 表示期間を選ぶ（見出しの「⋯」から。狭いペインでは期間の選択が見出しから隠れる） */
export async function pickPeriod(pane: PaneNode): Promise<void> {
  const c = await choiceDialog(t('period.label'), [
    { id: '-1', label: t('period.default') },
    ...PERIODS.map((p, i) => ({ id: String(i), label: t(p.key), hint: `Alt+${i + 1}` })),
  ])
  if (c == null) return
  const v = Number(c)
  patchState(pane, { period: v < 0 ? undefined : v })
}
/** チャートの見出しの「⋯」に足す項目（狭いと隠れる表示期間・指標・画像の保存）。画像の保存は設定で ON のときだけ（FR-C11） */
export function chartMore(pane: PaneNode, saveImage?: () => void): MoreItem[] {
  const pi = pane.state.period as number | undefined
  const p = pi == null ? undefined : PERIODS[pi]
  return [
    { id: 'period', label: t('period.label'), hint: p ? t(p.key) : t('period.default'), run: () => void pickPeriod(pane) },
    { id: 'ind', label: t('chart.indTip'), hint: 'I', run: () => void chartMenu(pane) },
    ...(app.settings.chartSave && saveImage ? [{ id: 'saveImage', label: t('chart.saveImage'), hint: 'S', run: saveImage }] : []),
  ]
}

/**
 * このチャートの銘柄を変える（C キー・見出しの銘柄名）。コマンドバーで選んだ銘柄は sendSymbol でこのペインに届く:
 * リンク色があればそのグループ、無ければこのチャートだけが変わる（FR-L11）
 */
export function changeSymbol(pane: PaneNode): void {
  app.focus = pane.id
  const cur = paneSymbol(pane)
  app.overlay = { kind: 'palette', q: '', title: t('chart.changeTitle', { name: cur ? nameOf(cur) : '' }) }
}
/** chart・mtf-chart の共通のキー。扱えたら true */
export function chartKey(pane: PaneNode, e: KeyboardEvent): boolean {
  // 表示期間（Alt+1〜6、グリッドと同じ）
  const period = periodOfKey(e)
  if (period != null) {
    patchState(pane, { period })
    return true
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  const c = e.code
  if (c === 'KeyC' && !e.shiftKey) {
    changeSymbol(pane)
    return true
  }
  if (c === 'KeyL') {
    patchState(pane, { log: !pane.state.log })
    toast(`${t('chart.log')}: ${pane.state.log ? 'ON' : 'OFF'}`)
    return true
  }
  if (c === 'KeyA') {
    const order: Adjustment[] = ['split', 'unadjusted', 'total']
    const cur = (pane.state.adj as Adjustment) ?? 'split'
    const next = order[(order.indexOf(cur) + 1) % 3]!
    patchState(pane, { adj: next })
    toast(`${t('chart.adjust')}: ${t(`adj.${next}` as Key)}`)
    return true
  }
  if (c === 'KeyT') {
    const cur = (pane.state.ctype as ChartType) ?? 'candle'
    const next = TYPES[(TYPES.indexOf(cur) + 1) % TYPES.length]!
    patchState(pane, { ctype: next })
    toast(`${t('chart.menuType')}: ${t(`ctype.${next}` as Key)}`)
    return true
  }
  if (c === 'KeyI') {
    void chartMenu(pane)
    return true
  }
  return false
}
