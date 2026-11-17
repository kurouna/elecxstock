// ニュースの登録表（L2）: 同梱の resources/news/feeds.json を実際に読み、厳格に確かめる。と、ニュースのコードの境界（import）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { parseFeed } from '@core/news/parse'
import { readRegistry } from '@core/news/registry'
import { stubRss } from '@core/news/stub'
import { feedSchema, shortWidth } from '@shared/news/schema'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../..')
const raw = JSON.parse(readFileSync(join(ROOT, 'resources/news/feeds.json'), 'utf8')) as { schemaVersion: number; feeds: unknown[] }
const feeds = raw.feeds.map((f) => feedSchema.parse(f))

describe('FR-NW2 登録表（同梱の JSON）', () => {
  it('どの行もスキーマに合い、読み込みで 1 行も捨てない', () => {
    const log: string[] = []
    expect(readRegistry(raw, (m) => log.push(m))).toHaveLength(raw.feeds.length)
    expect(log).toEqual([])
  })
  it('ID は一意で、言語の接頭辞がフィードの言語と合う', () => {
    expect(new Set(feeds.map((f) => f.id)).size).toBe(feeds.length)
    for (const f of feeds) expect(f.id.startsWith(`${f.lang}.`), f.id).toBe(true)
  })
  it('URL は https。印は全角 3 字・半角 5 字まで。linkHosts は小文字のホスト名', () => {
    for (const f of feeds) {
      expect(new URL(f.url).protocol).toBe('https:')
      expect(shortWidth(f.short)).toBeLessThanOrEqual(6)
      for (const h of f.linkHosts) expect(h).toBe(h.toLowerCase())
    }
  })
  it('既定でオンにするのは規約を確かめたフィードだけ。日本語・英語のどちらにも既定オンがある', () => {
    for (const f of feeds) if (f.defaultOnFor.length) expect(f.terms?.checked, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(feeds.some((f) => f.defaultOnFor.includes('ja'))).toBe(true)
    expect(feeds.some((f) => f.defaultOnFor.includes('en'))).toBe(true)
  })
  it('FR-NW9 Bloomberg と JPX は要約を出さない。Bloomberg は権利の表記・7 日・日本語の表示でも既定オン', () => {
    for (const f of feeds.filter((x) => /bloomberg|jpx/.test(x.url))) expect(f.summary, f.id).toBe(false)
    const bbg = feeds.find((f) => f.id === 'en.bbgmkt')!
    expect(bbg).toMatchObject({ copyright: '© Bloomberg L.P.', keepDays: 7, defaultOnFor: ['ja', 'en'] })
    expect(bbg.listFor).toContain('ja')
  })
  it('規約が配るアプリでの利用・再配信・蓄積を断っている配信元は登録しない（2026-11-17 に確認。docs/news-feeds-notes.md）', () => {
    // Yahoo!ニュース: RSS を使ったアプリの公開を許可しない／時事: プログラムによる再配信・蓄積を許可しない／
    // 内閣府: RSS の情報の再配布などを断る／ITmedia: アプリへの組み込みは要相談
    const hosts = feeds.map((f) => new URL(f.url).hostname)
    for (const h of ['news.yahoo.co.jp', 'www.jiji.com', 'www.cao.go.jp', 'rss.itmedia.co.jp']) expect(hosts, h).not.toContain(h)
  })
  it('どのフィードも規約を確かめてある（読めなかった配信元は登録しない。The Japan Times は規約のページを読めなかった）', () => {
    expect(feeds.filter((f) => !f.terms).map((f) => f.id)).toEqual([])
  })
  it('知らない schemaVersion は全体を使わない。合わない行と重なる ID・規約の無い既定オンは捨てる', () => {
    expect(readRegistry({ schemaVersion: 2, feeds: raw.feeds })).toBeNull()
    expect(readRegistry(null)).toBeNull()
    const a = raw.feeds[0] as Record<string, unknown>
    const r = readRegistry({
      schemaVersion: 1,
      feeds: [a, a, { ...a, id: 'ja.x', url: 'http://x.example/' }, { ...a, id: 'ja.y', terms: null }],
    })
    expect(r!.map((f) => f.id)).toEqual([a.id])
  })
  it('スタブのフィードはどのフィードにも、読める架空の見出しを返す', () => {
    for (const f of feeds) {
      const p = parseFeed(stubRss(f, Date.UTC(2026, 10, 17, 3)))
      expect(p.items.length, f.id).toBeGreaterThan(0)
      for (const it of p.items) expect(it.title, f.id).toMatch(/架空|fictional/i)
    }
  })
})

/** src の下の .ts・.svelte */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|svelte)$/.test(n) ? [p] : []
  })
}
const SRC = join(ROOT, 'src')
const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const importsOf = (p: string) => [...readFileSync(p, 'utf8').matchAll(/(?:import|from)\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!)
/** news/ の外から news を取り込んでよいファイル（設計 §11 の差し込み） */
const GATES = new Set([
  'src/shared/api.ts',
  'src/core/worker.ts',
  'src/core/dispatch.ts',
  'src/main/index.ts',
  'src/renderer/lib/i18n.ts',
  'src/renderer/components/Pane.svelte',
  'src/renderer/components/overlays/Settings.svelte',
  'src/renderer/components/overlays/FirstRun.svelte',
  'src/renderer/components/overlays/Help.svelte',
  'src/renderer/components/App.svelte',
])

describe('FR-NW2 ニュースのコードの境界（docs/design-news.md §11）', () => {
  it('news/ の外から news を取り込むのは、差し込みのファイルだけ', () => {
    const bad: string[] = []
    for (const p of files(SRC)) {
      const r = rel(p)
      if (r.includes('/news/')) continue
      if (importsOf(p).some((i) => /(^|\/)news\//.test(i)) && !GATES.has(r)) bad.push(r)
    }
    expect(bad).toEqual([])
  })
  it('src/core/news は Core のほかの部品（netGuard を除く）を取り込まない', () => {
    const bad: string[] = []
    for (const p of files(join(SRC, 'core', 'news')))
      for (const i of importsOf(p)) if (/^\.\.\//.test(i) && !/\.\.\/\.\.\/\.\.\/resources\/news\//.test(i)) bad.push(`${rel(p)} → ${i}`)
    expect(bad).toEqual([])
  })
})
