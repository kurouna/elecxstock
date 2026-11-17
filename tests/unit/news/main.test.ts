// main のニュースの部品（L1）: 管理者のポリシーの読み取り・コピーの文字の検査
import { describe, expect, it } from 'vitest'
import { COPY_MAX, cleanCopyText } from '../../../src/main/news/clipboard'
import { POLICY_KEY, policyOffFromReg, readNewsPolicy } from '../../../src/main/news/policy'

const BS = String.fromCharCode(92) // バックスラッシュ（エディタやシェルで落ちないように文字コードで書く）
const KEY = ['HKLM', 'Software', 'Policies', 'elecxstock'].join(BS)

describe('FR-NW3 管理者のポリシー', () => {
  it('読むキーは HKLM\\Software\\Policies\\elecxstock で、reg.exe に query・キー・/v News を渡す', async () => {
    expect(POLICY_KEY).toBe(KEY)
    const calls: string[][] = []
    const exec = (_f: string, args: string[], cb: (err: Error | null, out: string) => void) => {
      calls.push(args)
      cb(null, `\r\n${['HKEY_LOCAL_MACHINE', 'Software', 'Policies', 'elecxstock'].join(BS)}\r\n    News    REG_DWORD    0x0\r\n`)
    }
    expect(await readNewsPolicy({}, 'win32', exec)).toBe(true)
    expect(calls).toEqual([['query', KEY, '/v', 'News']])
  })
  it('reg.exe が失敗したら（キーが無い）ポリシーなし', async () => {
    expect(await readNewsPolicy({}, 'win32', (_f, _a, cb) => cb(new Error('not found'), ''))).toBe(false)
  })
  it('News が 0 なら止める（DWORD・文字列）。1・無いときは止めない', () => {
    const out = (v: string) => `\r\n    News    ${v}\r\n\r\n`
    expect(policyOffFromReg(out('REG_DWORD    0x0'))).toBe(true)
    expect(policyOffFromReg(out('REG_DWORD    0x1'))).toBe(false)
    expect(policyOffFromReg(out('REG_SZ    0'))).toBe(true)
    expect(policyOffFromReg('')).toBe(false)
  })
  it('環境変数 ELECXSTOCK_NEWS=off でも止める。Windows でなければレジストリを読まない', async () => {
    expect(await readNewsPolicy({ ELECXSTOCK_NEWS: 'off' }, 'linux')).toBe(true)
    expect(await readNewsPolicy({}, 'linux')).toBe(false)
  })
})

describe('FR-NW7 コピーの文字の検査（main）', () => {
  it('文字列だけ・100 KB まで。改行とタブは残し、ほかの制御文字を除く', () => {
    expect(cleanCopyText('A\tB\r\nC\u0007D')).toBe('A\tB\nCD')
    expect(cleanCopyText(42)).toBeNull()
    expect(cleanCopyText('')).toBeNull()
    expect(cleanCopyText('x'.repeat(COPY_MAX + 1))).toBeNull()
  })
})
