// Lightweight Charts の帰属表示（§10）: 画面に出す NOTICE の 2 行が、配布物に入れる NOTICE・README と同じ文言か
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LWC_NOTICE, TRADINGVIEW_URL } from '@shared/attribution'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('Lightweight Charts の帰属表示（§10）', () => {
  it('画面の 2 行は scripts/notices の NOTICE（THIRD_PARTY_NOTICES.txt に入る）と同じ', () => {
    expect(read('scripts/notices/lightweight-charts.NOTICE').trim().split(/\r?\n/)).toEqual([...LWC_NOTICE])
  })

  it('上流のとおり著作権の行を持ち、リンク先は tradingview.com', () => {
    expect(LWC_NOTICE[0]).toBe('TradingView Lightweight Charts™')
    expect(LWC_NOTICE[1]).toMatch(/^Copyright \(с\) 2025 TradingView, Inc\. https:\/\/www\.tradingview\.com\/$/)
    expect(LWC_NOTICE[1]).toContain(TRADINGVIEW_URL)
  })

  it('README の日英のライセンスの節に 2 行を載せている', () => {
    const readme = read('README.md')
    for (const line of LWC_NOTICE) expect(readme.split(line).length - 1).toBe(2)
  })
})
