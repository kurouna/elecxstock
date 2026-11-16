// 陽線・陰線の色: 設定（candleStyle）→ ルートの data-candle → app.css のトークン（--up / --down）。
// チャート・タイル・前日比・騰落率はどれもこのトークンから色を取るので、トークンの値と使う側の参照を確かめる
import { readFileSync } from 'node:fs'
import { settingsSchema } from '@shared/api'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { describe, expect, it } from 'vitest'
import { stubWindow } from '../../support/window'

stubWindow()
const { cls } = await import('../../../src/renderer/lib/format')

const css = readFileSync('src/renderer/app.css', 'utf8')
function tokens(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`)
  expect(i, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(i, css.indexOf('}', i))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]))
}
/** 色相（0〜360） */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((k) => Number.parseInt(hex.slice(k, k + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
const isRed = (hex: string) => hue(hex) < 20 || hue(hex) > 340
const isGreen = (hex: string) => hue(hex) > 90 && hue(hex) < 170
/** 青緑〜青（日本式の陰線） */
const isCool = (hex: string) => hue(hex) >= 170 && hue(hex) <= 240

describe('陽線・陰線の色（FR-C9）', () => {
  const dark = tokens(':root')
  const light = { ...dark, ...tokens(':root[data-theme="light"]') }
  const darkUs = { ...dark, ...tokens(':root[data-candle="us"]') }
  const lightUs = { ...light, ...tokens(':root[data-theme="light"][data-candle="us"]') }

  it('既定は日本式', () => {
    expect(DEFAULT_SETTINGS.candleStyle).toBe('jp')
  })
  it('日本式: 陽線 = 赤、陰線 = 青緑〜青（ダーク・ライトとも）', () => {
    for (const t of [dark, light]) {
      expect(isRed(t.up!), t.up).toBe(true)
      expect(isCool(t.down!), t.down).toBe(true)
    }
  })
  it('欧米式: 陽線 = 緑、陰線 = 赤（ダーク・ライトとも）', () => {
    for (const t of [darkUs, lightUs]) {
      expect(isGreen(t.up!), t.up).toBe(true)
      expect(isRed(t.down!), t.down).toBe(true)
    }
  })
  it('前日比・騰落率の色も同じトークン（.up / .down）を使う', () => {
    expect(cls(1.5)).toBe('up')
    expect(cls(-0.2)).toBe('down')
    expect(cls(0)).toBe('flat')
    expect(css).toMatch(/\.up\s*\{\s*color:\s*var\(--up\);/)
    expect(css).toMatch(/\.down\s*\{\s*color:\s*var\(--down\);/)
  })
  it('チャートとグリッドのタイルも --up / --down から色を取る', () => {
    for (const f of ['src/renderer/components/widgets/ChartView.svelte', 'src/renderer/components/widgets/gridDraw.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toContain("css('--up')")
      expect(src, f).toContain("css('--down')")
    }
  })
  // 要求は「日本式・欧米式・カスタムを選べる」。設定は 'jp' | 'us' の 2 つだけで、カスタムの色は選べない。直すまで it.fails で残す
  it.fails('カスタムの色を選べる', () => {
    expect(settingsSchema.shape.candleStyle.safeParse('custom').success).toBe(true)
  })
})
