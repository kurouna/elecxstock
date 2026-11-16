// データが最新か（F5 の「データは最新です」。FR-F10, FR-MB3。L1）。時刻はすべて日本時間で固定
import { isUpToDate, lastOverseasClose } from '@shared/freshness'
import { describe, expect, it } from 'vitest'

const jst = (s: string) => Date.parse(`${s}+09:00`)
const iso = (s: string) => new Date(jst(s)).toISOString()
const full = { instruments: 100, withBars: 100 }

describe('海外の終値の区切り（FR-MB3）', () => {
  it('火〜土の朝 7:00。7:00 より前はその前の区切り', () => {
    // 2026-11-17 は火曜
    expect(lastOverseasClose(jst('2026-11-17T08:00:00'))).toBe(jst('2026-11-17T07:00:00'))
    expect(lastOverseasClose(jst('2026-11-17T06:59:00'))).toBe(jst('2026-11-14T07:00:00')) // 月の朝は土の朝に戻る
    expect(lastOverseasClose(jst('2026-11-14T12:00:00'))).toBe(jst('2026-11-14T07:00:00')) // 土
  })
  it('日・月は、土の朝の区切りのまま（米国の金曜の終値）', () => {
    expect(lastOverseasClose(jst('2026-11-15T12:00:00'))).toBe(jst('2026-11-14T07:00:00'))
    expect(lastOverseasClose(jst('2026-11-16T12:00:00'))).toBe(jst('2026-11-14T07:00:00'))
  })
})

describe('データが最新か（FR-F10, FR-MB3）', () => {
  it('東証の大引けと海外の終値のあとに更新していれば最新', () => {
    // 月曜の昼: 直近の取引日は金曜（11/13）、海外は土曜の朝
    expect(isUpToDate(iso('2026-11-14T08:00:00'), full, jst('2026-11-16T12:00:00'))).toBe(true)
  })
  it('金曜の夜に更新しただけなら、土曜の朝の米国の終値を取っていないので最新ではない', () => {
    expect(isUpToDate(iso('2026-11-13T18:00:00'), full, jst('2026-11-16T12:00:00'))).toBe(false)
  })
  it('大引けの前の更新は最新ではない', () => {
    // 火曜 16:00: 直近の取引日は火曜（11/17）
    expect(isUpToDate(iso('2026-11-17T10:00:00'), full, jst('2026-11-17T16:00:00'))).toBe(false)
    expect(isUpToDate(iso('2026-11-17T15:40:00'), full, jst('2026-11-17T16:00:00'))).toBe(true)
  })
  it('日足の無い銘柄（新しく足した行など）があれば最新ではない', () => {
    expect(isUpToDate(iso('2026-11-14T08:00:00'), { instruments: 120, withBars: 100 }, jst('2026-11-16T12:00:00'))).toBe(false)
  })
  it('一度も更新していない・日足が無いときは最新ではない', () => {
    expect(isUpToDate(null, full, jst('2026-11-16T12:00:00'))).toBe(false)
    expect(isUpToDate(iso('2026-11-14T08:00:00'), { instruments: 100, withBars: 0 }, jst('2026-11-16T12:00:00'))).toBe(false)
    expect(isUpToDate(iso('2026-11-14T08:00:00'), null, jst('2026-11-16T12:00:00'))).toBe(false)
  })
})
