// チャートの画像の保存（FR-C11）: ファイル名・上の 1 行の文言と幅への収め方・見えている期間・S キーの判定（設定が OFF なら効かない）・保存の流れ
import type { SaveFileResult } from '@shared/bridge'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type ChartSnapshot,
  chartImageName,
  chartImageRange,
  chartImageTitle,
  fitHeader,
  isSaveKey,
  SAVE_TOAST,
  saveChartImage,
  visibleSpan,
} from '../../../src/renderer/lib/chartImage'

type Mod = 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'repeat'
const key = (code: string, m: Partial<Record<Mod, boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  ...m,
})
/** 1 文字 10、太字は 12 の幅として測る */
const measure = (s: string, bold: boolean) => [...s].length * (bold ? 12 : 10)

describe('チャートの画像の保存（FR-C11）', () => {
  it('ファイル名はコード・時間軸・日付。ファイル名に使えない文字は _ にする', () => {
    expect(chartImageName('8306', 'D', '2026-11-16')).toBe('elecxstock-8306-D-2026-11-16.png')
    expect(chartImageName('94345', 'M', '2026-01-05')).toBe('elecxstock-94345-M-2026-01-05.png')
    expect(chartImageName('^N 225/x', 'W', '2026-11-16')).toBe('elecxstock-^N_225_x-W-2026-11-16.png')
  })

  it('上の 1 行: 左は「コード 銘柄名 · 時間軸」、右は見えている期間（分からなければ空）', () => {
    expect(chartImageTitle('8306', '三菱ＵＦＪフィナンシャル・グループ', '日足')).toBe('8306 三菱ＵＦＪフィナンシャル・グループ · 日足')
    expect(chartImageTitle('8306', '', '週足')).toBe('8306 · 週足')
    expect(chartImageRange('2025-11-17', '2026-11-13')).toBe('2025/11/17 – 2026/11/13')
    expect(chartImageRange(undefined, '2026-11-13')).toBe('')
    expect(chartImageRange()).toBe('')
  })

  it('見えている期間は足の範囲に収める（一目の先行スパンで時間軸が最後の足より先まで延びていても、未来の日付にしない）', () => {
    const time = ['2026-01-05', '2026-01-06', '2026-11-13']
    expect(visibleSpan('2026-01-06', '2026-12-18', time)).toEqual({ from: '2026-01-06', to: '2026-11-13' })
    expect(visibleSpan('2025-12-01', '2026-01-06', time)).toEqual({ from: '2026-01-05', to: '2026-01-06' })
    expect(visibleSpan(undefined, '2026-11-13', time)).toEqual({})
    expect(visibleSpan('2026-01-05', '2026-11-13', [])).toEqual({})
  })

  it('見出しの 1 行は幅に収める: 入れば両方、銘柄と期間が入らなければ期間を出さず、銘柄も入らなければ末尾を … で切る', () => {
    // 銘柄 10 文字（120）＋間 16＋期間 5 文字（50）= 186
    expect(fitHeader('0123456789', 'abcde', 186, 16, measure)).toEqual({ title: '0123456789', range: 'abcde' })
    expect(fitHeader('0123456789', 'abcde', 185, 16, measure)).toEqual({ title: '0123456789', range: '' })
    expect(fitHeader('0123456789', 'abcde', 120, 16, measure)).toEqual({ title: '0123456789', range: '' })
    // 120 未満: 収まる長さまで切って … を付ける（5 文字＋… = 72）
    expect(fitHeader('0123456789', 'abcde', 72, 16, measure)).toEqual({ title: '01234…', range: '' })
    expect(fitHeader('0123456789', '', 71, 16, measure)).toEqual({ title: '0123…', range: '' })
    // 1 文字も入らなければ空
    expect(fitHeader('0123456789', 'abcde', 5, 16, measure)).toEqual({ title: '', range: '' })
    // サロゲートペアを途中で切らない
    expect(fitHeader('𠮷𠮷𠮷𠮷', '', 36, 16, measure)).toEqual({ title: '𠮷𠮷…', range: '' })
  })

  it('S キーは設定が ON で、修飾キーが無く、押しっぱなしの繰り返しでないときだけ', () => {
    expect(isSaveKey(key('KeyS'), true)).toBe(true)
    // 既定の OFF ではキーも効かない（オプトイン）
    expect(isSaveKey(key('KeyS'), false)).toBe(false)
    for (const m of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'repeat'] as const)
      expect(isSaveKey(key('KeyS', { [m]: true }), true)).toBe(false)
    expect(isSaveKey(key('KeyD'), true)).toBe(false)
  })

  it('保存の結果ごとのトースト: 取りやめたときは出さない', () => {
    expect(SAVE_TOAST).toEqual({ saved: 'chart.imageSaved', cancelled: null, notReady: 'chart.imageNotReady', failed: 'chart.imageFailed' })
  })
})

describe('チャートの画像の保存の流れ（FR-C11）', () => {
  const g = globalThis as Record<string, unknown>
  /** document と window を最小限に差し替える（キャンバスは描いたことにして PNG の印のバイト列を返す） */
  function stub(
    savePng: (name: string, b: Uint8Array) => Promise<SaveFileResult>,
    buf: () => Promise<ArrayBuffer> = async () => new Uint8Array([0x89, 0x50]).buffer,
  ) {
    const ctx = new Proxy(
      {},
      { get: (_t, p) => (p === 'measureText' ? (s: string) => ({ width: s.length * 7 }) : () => {}), set: () => true },
    )
    const canvas = () => ({
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: { arrayBuffer: () => Promise<ArrayBuffer> }) => void) => cb({ arrayBuffer: buf }),
    })
    g.document = { createElement: canvas, documentElement: {} }
    g.getComputedStyle = () => ({ getPropertyValue: () => '' })
    g.window = { elecxstock: { savePng } }
    return canvas() as unknown as HTMLCanvasElement
  }
  const opts = {
    code: '8306',
    name: '三菱ＵＦＪ',
    tfLabel: (x: string) => ({ D: '日足', W: '週足', M: '月足' })[x] ?? x,
    date: '2026-11-13',
  }
  afterEach(() => {
    delete g.document
    delete g.getComputedStyle
    delete g.window
  })

  it('名前は描いている足の時間軸（D/W/M を押した直後で前の足を出していれば、前の時間軸）', async () => {
    const save = vi.fn(async (): Promise<SaveFileResult> => 'saved')
    const shot = stub(save)
    const snap: ChartSnapshot = { canvas: shot, tf: 'D', scale: 1, from: '2026-01-05', to: '2026-11-13' }
    expect(await saveChartImage(snap, opts)).toBe('saved')
    expect(save).toHaveBeenCalledWith('elecxstock-8306-D-2026-11-13.png', expect.any(Uint8Array))
  })

  it('描けていなければ notReady、取り消しは cancelled、保存に失敗（reject）したら failed', async () => {
    stub(async () => 'saved')
    expect(await saveChartImage(null, opts)).toBe('notReady')
    const shot = stub(async () => 'cancelled')
    expect(await saveChartImage({ canvas: shot, tf: 'W', scale: 1 }, opts)).toBe('cancelled')
    // main が書けなかった（権限・使用中）と返したら、取りやめではなく failed（利用者に知らせる）
    const shot3 = stub(async () => 'failed')
    expect(await saveChartImage({ canvas: shot3, tf: 'W', scale: 1 }, opts)).toBe('failed')
    const shot2 = stub(async () => {
      throw new Error('EACCES')
    })
    expect(await saveChartImage({ canvas: shot2, tf: 'W', scale: 1 }, opts)).toBe('failed')
  })

  it('保存中の 2 回目は保存ダイアログを重ねて出さず、終わればまた保存できる', async () => {
    let done: (v: SaveFileResult) => void = () => {}
    const save = vi.fn(() => new Promise<SaveFileResult>((r) => (done = r)))
    const shot = stub(save)
    const snap: ChartSnapshot = { canvas: shot, tf: 'D', scale: 2 }
    const first = saveChartImage(snap, opts)
    expect(await saveChartImage(snap, opts)).toBe('cancelled')
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    done('saved')
    expect(await first).toBe('saved')
    const again = saveChartImage(snap, opts)
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    done('saved')
    expect(await again).toBe('saved')
  })

  it('PNG のバイト列を読めなかった（arrayBuffer が reject）ら failed で、保存中のままにしない（次の保存ができる）', async () => {
    const save = vi.fn(async (): Promise<SaveFileResult> => 'saved')
    const shot = stub(save, async () => {
      throw new Error('NotReadableError')
    })
    const snap: ChartSnapshot = { canvas: shot, tf: 'D', scale: 1 }
    const r = await Promise.race([saveChartImage(snap, opts), new Promise((res) => setTimeout(() => res('hung'), 200))])
    expect(r).toBe('failed')
    const ok = stub(save)
    expect(await saveChartImage({ canvas: ok, tf: 'D', scale: 1 }, opts)).toBe('saved')
  })
})
