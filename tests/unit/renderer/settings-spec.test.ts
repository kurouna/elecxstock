// 設定の画面の判定（docs/design-dialogs.md §6。FR-KB11）: 既定から変えたか・変えた数・探す・値を送る・保存期間の見込み
import { describe, expect, it } from 'vitest'
import {
  footHints,
  isModified,
  modifiedCount,
  retentionEstimate,
  rowById,
  SCALES,
  searchSettings,
  stepIn,
} from '../../../src/renderer/lib/settingsSpec'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { Settings } from '../../../src/shared/types'

const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o })
const tr = (k: string) =>
  ({
    'set.autoUpdate': '自動で更新する',
    'set.alertNotify': 'アラートを Windows の通知でも知らせる',
    'set.alertNotifyDesc': 'オフでも、アプリの中のベルと履歴には残ります',
    'set.closeToTray': '閉じても通知領域で動かし続ける',
    'set.closeToTrayHint': '× で閉じても自動の更新とアラートを続けます。終了は通知領域のアイコンのメニューから',
    'set.logs': 'ログ',
    'set.logsDesc': '取得の失敗などを日付ごとに残しています',
    'set.logsAlias': 'ろぐ,log',
  })[k] ?? ''

describe('既定から変えた項目（FR-KB11）', () => {
  it('既定と違えば変えた。配列も中身で比べる', () => {
    expect(isModified(rowById('theme')!, S())).toBe(false)
    expect(isModified(rowById('theme')!, S({ theme: 'light' }))).toBe(true)
    expect(isModified(rowById('yieldTargets')!, S({ yieldTargets: [4] }))).toBe(false)
    expect(isModified(rowById('yieldTargets')!, S({ yieldTargets: [4, 5] }))).toBe(true)
    // 既定に戻せない行（Windows の登録・ボタンだけの行）は数えない
    expect(isModified(rowById('loginStart')!, S())).toBe(false)
    expect(isModified(rowById('reset')!, S())).toBe(false)
  })
  it('タブごとの変えた数。キーのタブは割り当てを変えたアクションの数', () => {
    expect(modifiedCount('display', S({ theme: 'light', uiScale: 1.1 }))).toBe(2)
    expect(modifiedCount('general', S())).toBe(0)
    expect(modifiedCount('keys', S({ keymap: { max: 'Ctrl+M', fav: '' } }))).toBe(2)
  })
})

describe('設定を探す（FR-KB11）', () => {
  it('名前・説明・別名で全タブから探し、名前の当たった範囲を返す', () => {
    expect(searchSettings('通知', tr).map((x) => x.row.id)).toEqual(['closeToTray', 'alertNotify'])
    const logs = searchSettings('ろぐ', tr)
    expect(logs.map((x) => x.row.id)).toEqual(['logs'])
    expect(logs[0]!.ranges).toEqual([[0, 2]])
    expect(searchSettings('自動', tr)[0]).toMatchObject({ row: { id: 'autoUpdate' }, ranges: [[0, 2]] })
    expect(searchSettings('', tr)).toEqual([])
  })
})

describe('ステッパーの値（FR-KB11, FR-V10, FR-D6）', () => {
  it('並びの中で前後へ（端で止まる）', () => {
    expect(stepIn(SCALES, 1, 1)).toBe(1.1)
    expect(stepIn(SCALES, 1.5, 1)).toBe(1.5)
    expect(stepIn(SCALES, 0.8, -1)).toBe(0.8)
    // 並びに無い値は近いものから
    expect(stepIn(SCALES, 1.05, 1)).toBe(1.1)
    expect(stepIn([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, -1)).toBe(2)
  })
  it('保存期間の容量の見込み: 今の容量を年で割って比べる', () => {
    expect(retentionEstimate(300 * 2 ** 20, 3, 3)).toEqual({ mb: 300, deltaMb: 0 })
    expect(retentionEstimate(300 * 2 ** 20, 3, 1)).toEqual({ mb: 100, deltaMb: -200 })
    expect(retentionEstimate(300 * 2 ** 20, 3, 10)).toEqual({ mb: 1000, deltaMb: 700 })
    expect(retentionEstimate(0, 3, 5)).toEqual({ mb: 0, deltaMb: 0 })
  })
})

describe('セグメント・節のまとまり（FR-KB11）', () => {
  it('segStep: ← → で前後の選択肢（端で止まる）。ほかのキーは null', async () => {
    const { segStep } = await import('../../../src/renderer/lib/settingsSpec')
    expect(segStep(['ja', 'en'], 'ja', 'ArrowRight')).toBe('en')
    expect(segStep(['ja', 'en'], 'en', 'ArrowRight')).toBe('en')
    expect(segStep(['ja', 'en'], 'en', 'ArrowLeft')).toBe('ja')
    expect(segStep(['ja', 'en'], 'ja', 'Enter')).toBeNull()
  })
  it('groupRows: 続いた同じキーの行を 1 つの節に', async () => {
    const { groupRows } = await import('../../../src/renderer/lib/settingsSpec')
    const rows = [{ k: 'a' }, { k: 'a' }, { k: 'b' }]
    expect(groupRows(rows, (r) => r.k).map((g) => [g.key, g.items.length])).toEqual([
      ['a', 2],
      ['b', 1],
    ])
  })
})

describe('既定の値の書き方（FR-KB11）', () => {
  it('defaultText: 既定の値を画面の言葉で', async () => {
    const { defaultText } = await import('../../../src/renderer/lib/settingsSpec')
    const tr = (k: string, a?: Record<string, string | number>) => (a ? `${k}:${JSON.stringify(a)}` : k)
    expect(defaultText('closeToTray', tr)).toBe('set.off')
    expect(defaultText('autoUpdate', tr)).toBe('set.on')
    expect(defaultText('uiScale', tr)).toBe('100%')
    expect(defaultText('retentionYears', tr)).toBe('set.years:{"n":3}')
    expect(defaultText('theme', tr)).toBe('set.dark')
    expect(defaultText('lang', tr)).toBe('日本語')
    expect(defaultText('yieldTargets', tr)).toBe('4%')
    expect(defaultText('userInstruments', tr)).toBe('')
  })
})

describe('キーの割り当ての一覧（FR-KB6）', () => {
  it('名前・キーで探し、変えたものだけにも絞れる。分類の順に並べる', async () => {
    const { keyRows } = await import('../../../src/renderer/lib/settingsSpec')
    const acts = [
      { id: 'quit', label: 'アプリを終了', key: 'Ctrl+Shift+Q', group: 'app' as const },
      { id: 'max', label: '最大化', key: 'Ctrl+Shift+Enter', group: 'pane' as const },
      { id: 'fav', label: 'お気に入り', key: 'Ctrl+D', group: 'sym' as const },
    ]
    expect(keyRows(acts, { q: '', onlyChanged: false, keymap: {} }).map((r) => r.a.id)).toEqual(['max', 'fav', 'quit'])
    expect(keyRows(acts, { q: 'ctrl+d', onlyChanged: false, keymap: {} }).map((r) => r.a.id)).toEqual(['fav'])
    expect(keyRows(acts, { q: '', onlyChanged: true, keymap: { quit: 'Ctrl+Alt+Q' } }).map((r) => r.a.id)).toEqual(['quit'])
    expect(keyRows(acts, { q: '最大', onlyChanged: false, keymap: {} })[0]!.ranges).toEqual([[0, 2]])
    // 分類の名前でも当たる（名前の印は付けない）
    const groupName = (g: string) => ({ pane: 'ペイン・レイアウト', sym: '銘柄', app: 'アプリ' })[g] ?? ''
    expect(keyRows(acts, { q: 'レイアウト', onlyChanged: false, keymap: {}, groupName }).map((r) => r.a.id)).toEqual(['max'])
  })
})

describe('レビューの指摘の再現（FR-KB11）', () => {
  it('探した結果を枠にまとめると、同じタブは 1 回だけ（どの語でも）', async () => {
    const { SETTING_ROWS, groupRows, searchSettings } = await import('../../../src/renderer/lib/settingsSpec')
    const { ja, en } = await import('../../../src/renderer/lib/i18n')
    for (const d of [ja, en] as Record<string, string>[]) {
      const tr = (k: string) => d[k] ?? ''
      const words = new Set(
        SETTING_ROWS.flatMap((r) => [tr(r.label), tr(r.desc ?? '')].join(' ').split(/[\s、。（）()・,]+/)).filter((w) => w.length >= 2),
      )
      for (const w of words) {
        const tabs = groupRows(searchSettings(w, tr), (x) => x.row.tab).map((g) => g.key)
        expect(new Set(tabs).size, w).toBe(tabs.length)
      }
    }
  })
  it('言語は既定から変えた数に入れない（英語の利用者にいつも 1 と出さない）', () => {
    expect(modifiedCount('general', S({ lang: 'en' }))).toBe(0)
  })
  it('キーのタブの変えた数は、実在するアクションだけ', () => {
    expect(modifiedCount('keys', S({ keymap: { max: 'Ctrl+M', gone: 'Ctrl+J' } }), ['max', 'fav'])).toBe(1)
  })
  it('signedMb: 差の符号（0 は符号なし）', async () => {
    const { signedMb } = await import('../../../src/renderer/lib/settingsSpec')
    expect(signedMb(120)).toBe('+120')
    expect(signedMb(-5)).toBe('−5')
    expect(signedMb(0)).toBe('0')
  })
  it('依存する行が使えるか（サインイン時の起動は Windows の登録、ほかは相手の設定）', async () => {
    const { dependencyOff, rowById } = await import('../../../src/renderer/lib/settingsSpec')
    expect(dependencyOff(rowById('startHidden')!, S(), false)).toBe(true)
    expect(dependencyOff(rowById('startHidden')!, S(), true)).toBe(false)
    expect(dependencyOff(rowById('yieldTargets')!, S({ yieldLine: false }), true)).toBe(true)
    expect(dependencyOff(rowById('yieldTargets')!, S({ yieldLine: true }), true)).toBe(false)
    expect(dependencyOff(rowById('theme')!, S(), false)).toBe(false)
  })
  it('行の種類の性質（幅の広い行・← → で値を変える行）', async () => {
    const { KIND } = await import('../../../src/renderer/lib/settingsSpec')
    expect(KIND.theme.wide && KIND.theme.valued).toBe(true)
    expect(KIND.switch.wide || KIND.switch.valued).toBe(false)
    expect(KIND.retention.valued).toBe(true)
  })
})

describe('下の段の案内（FR-KB11）', () => {
  it('タブにある部品の操作だけを出す（スイッチの無いタブに Space を出さない）', () => {
    expect(footHints('general')).toEqual({ toggle: true, value: true, reset: true })
    expect(footHints('data')).toEqual({ toggle: false, value: true, reset: true })
    expect(footHints('about')).toEqual({ toggle: false, value: false, reset: false })
  })
})
