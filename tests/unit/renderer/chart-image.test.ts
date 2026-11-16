// チャートの画像の保存（FR-C11）: ファイル名・上の 1 行の文言・S キーの判定（設定が OFF なら効かない）
import { describe, expect, it } from 'vitest'
import { chartImageName, chartImageRange, chartImageTitle, isSaveKey } from '../../../src/renderer/lib/chartImage'

const key = (code: string, m: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...m,
})

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

  it('S キーは設定が ON で、修飾キーが無いときだけ', () => {
    expect(isSaveKey(key('KeyS'), true)).toBe(true)
    // 既定の OFF ではキーも効かない（オプトイン）
    expect(isSaveKey(key('KeyS'), false)).toBe(false)
    for (const m of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const) expect(isSaveKey(key('KeyS', { [m]: true }), true)).toBe(false)
    expect(isSaveKey(key('KeyD'), true)).toBe(false)
  })
})
