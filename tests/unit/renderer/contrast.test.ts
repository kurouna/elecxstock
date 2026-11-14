// 文字色と地の色のコントラスト（NFR-Q5、WCAG AA 4.5:1）を、app.css のトークンから計算して守る
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/renderer/app.css', 'utf8')
function tokens(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`)
  const body = css.slice(i, css.indexOf('}', i))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]))
}
const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((k) => Number.parseInt(hex.slice(k, k + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

describe('コントラスト（NFR-Q5）', () => {
  const dark = tokens(':root')
  const light = { ...dark, ...tokens(':root[data-theme="light"]') }
  for (const [name, t] of [
    ['ダーク', dark],
    ['ライト', light],
  ] as const) {
    it(`${name}: 文字・補助文字・騰落の色が、パネルと選択行の上で 4.5:1 以上`, () => {
      for (const fg of ['text', 'text-2', 'text-3', 'up', 'down'])
        for (const bg of ['panel', 'panel-2']) expect(ratio(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      for (const fg of ['text', 'up', 'down'])
        expect(ratio(t[fg]!, t['select-strong']!), `${fg} on select-strong`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(t['accent-fg']!, t['accent-bg']!), 'primary button').toBeGreaterThanOrEqual(4.5)
      expect(ratio(t.danger!, t['danger-bg']!), 'danger button').toBeGreaterThanOrEqual(4.5)
    })
  }
})
