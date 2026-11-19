// main の IPC・プロトコルの判断（src/main/guards.ts）
import { join, normalize } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appFilePath, cycleSlot, isExternalAllowed } from '../../../src/main/guards'

describe('外部のリンクを開く先の制限（NFR-S3）', () => {
  it('このアプリのリポジトリと、その下のページは開ける', () => {
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock')).toBe(true)
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock/releases')).toBe(true)
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock/releases/tag/v0.1.13')).toBe(true)
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock#readme')).toBe(true)
  })
  it('名前が同じ文字で始まる別のリポジトリ・別のホストは開かない', () => {
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock-evil/releases')).toBe(false)
    expect(isExternalAllowed('https://github.com/kurouna/elecxstockx')).toBe(false)
    expect(isExternalAllowed('https://github.com.evil.example/kurouna/elecxstock')).toBe(false)
    expect(isExternalAllowed('http://github.com/kurouna/elecxstock')).toBe(false)
  })
  it('.. のセグメントで別のリポジトリへ抜ける URL は開かない（ブラウザと同じく正規化してから確かめる）', () => {
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock/../../evil/repo')).toBe(false)
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock/%2e%2e/%2E%2E/evil/repo')).toBe(false)
    expect(isExternalAllowed('https://github.com/kurouna/elecxstock/releases/../issues')).toBe(true)
    expect(isExternalAllowed('not a url')).toBe(false)
  })
  it('チャート・取引所・Yahoo のページ', () => {
    expect(isExternalAllowed('https://www.tradingview.com/chart/')).toBe(true)
    expect(isExternalAllowed('https://www.jpx.co.jp/listing/')).toBe(true)
    expect(isExternalAllowed('https://finance.yahoo.co.jp/quote/7203.T')).toBe(true)
  })
})

describe('app:// のファイルの解決（NFR-S3）', () => {
  const root = normalize(join('C:', 'app', 'out', 'renderer'))
  it('root の中のファイルのパス', () => {
    expect(appFilePath(root, '/index.html')).toBe(join(root, 'index.html'))
    expect(appFilePath(root, '/assets/a%20b.js')).toBe(join(root, 'assets', 'a b.js'))
  })
  it('不正な % の並びは例外にせず null（URIError で要求の処理が落ちない）', () => {
    expect(appFilePath(root, '/%E0%A4%A')).toBeNull()
    expect(appFilePath(root, '/%')).toBeNull()
  })
  it('root の外・root そのもの・NUL は null', () => {
    expect(appFilePath(root, '/../main/index.js')).toBeNull()
    expect(appFilePath(root, '/..%2F..%2Fsecret')).toBeNull()
    expect(appFilePath(root, '/')).toBeNull()
    expect(appFilePath(root, '/a%00b')).toBeNull()
  })
  it('.. で始まる名前のファイル（..foo.js）は root の中なので通す', () => {
    expect(appFilePath(root, '/..foo.js')).toBe(join(root, '..foo.js'))
    expect(appFilePath(root, '/assets/..x/a.js')).toBe(join(root, 'assets', '..x', 'a.js'))
  })
})

describe('窓の切り替え（FR-L7。Ctrl+F6）', () => {
  it('開いている窓の並びで次・前へ回る', () => {
    const open = ['main', 'free2', 'free3'] as const
    expect(cycleSlot(open, 'main', 1)).toBe('free2')
    expect(cycleSlot(open, 'free3', 1)).toBe('main')
    expect(cycleSlot(open, 'main', -1)).toBe('free3')
  })
  it('開いている窓が無ければ null（例外にしない）', () => {
    expect(cycleSlot([], 'main', 1)).toBeNull()
    expect(cycleSlot([], null, -1)).toBeNull()
  })
  it('送り元が並びに無いとき（閉じかけ）は端から', () => {
    expect(cycleSlot(['main', 'free2'], 'free3', 1)).toBe('main')
    expect(cycleSlot(['main', 'free2'], 'free3', -1)).toBe('free2')
  })
})
