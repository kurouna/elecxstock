// 起動の最初の色（テーマ。NFR-Q3）: main が窓を作る前に、保存した設定のファイルからテーマを読む
import { savedTheme, THEME_COLORS } from '@shared/settings'
import { describe, expect, it } from 'vitest'

describe('保存した設定のテーマ（NFR-Q3, FR-V8）', () => {
  it('利用者のデータの形（{ version, data }）と素の形のどちらも読む', () => {
    expect(savedTheme(JSON.stringify({ version: 1, data: { theme: 'light' } }))).toBe('light')
    expect(savedTheme(JSON.stringify({ theme: 'light' }))).toBe('light')
    expect(savedTheme(JSON.stringify({ version: 1, data: { theme: 'dark' } }))).toBe('dark')
  })
  it('ファイルが無い・壊れている・知らない値なら既定（ダーク）', () => {
    expect(savedTheme(null)).toBe('dark')
    expect(savedTheme('{broken')).toBe('dark')
    expect(savedTheme(JSON.stringify({ data: { theme: 'pink' } }))).toBe('dark')
  })
  it('窓の地の色とタイトルバーの色は、テーマごとに 1 か所で持つ', () => {
    expect(THEME_COLORS.light.background).not.toBe(THEME_COLORS.dark.background)
    for (const c of Object.values(THEME_COLORS)) for (const v of Object.values(c)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  })
})
