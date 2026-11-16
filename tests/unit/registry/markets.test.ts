// マーケット一覧の登録表の整合（FR-U6, FR-MB1。L2）
import { BOARD_GROUPS, isExternal, MARKET_REFS, REF_ETF_IDS, REF_INDEX_ROWS } from '@shared/markets'
import { describe, expect, it } from 'vitest'

describe('マーケット一覧の登録表（FR-U6, FR-MB1）', () => {
  it('ID と Yahoo の記号が重ならない', () => {
    expect(new Set(MARKET_REFS.map((r) => r.id)).size).toBe(MARKET_REFS.length)
    expect(new Set(MARKET_REFS.map((r) => r.yahoo)).size).toBe(MARKET_REFS.length)
  })
  it('どの行の区分もタブにあり、どのタブにも行がある', () => {
    for (const r of MARKET_REFS) expect(BOARD_GROUPS).toContain(r.group)
    for (const g of BOARD_GROUPS) expect(MARKET_REFS.some((r) => r.group === g)).toBe(true)
  })
  it('ID は IDX:（参照の行）か JP:（連動 ETF。東証の記号）。海外の行は日経平均以外の IDX:', () => {
    for (const r of MARKET_REFS) {
      if (r.id.startsWith('JP:')) expect(r.yahoo).toBe(`${r.id.slice(3)}.T`)
      else expect(r.id.startsWith('IDX:')).toBe(true)
    }
    expect(REF_ETF_IDS).toEqual(['JP:1306', 'JP:1591', 'JP:2516', 'JP:1343'])
    expect(REF_INDEX_ROWS.length + REF_ETF_IDS.length).toBe(MARKET_REFS.length)
    expect(MARKET_REFS.filter((r) => isExternal(r.id)).length).toBe(REF_INDEX_ROWS.length - 1)
  })
  it('名前は日本語と英語の両方がある', () => {
    for (const r of MARKET_REFS) {
      expect(r.name.ja.length).toBeGreaterThan(0)
      expect(r.name.en.length).toBeGreaterThan(0)
    }
  })
})
