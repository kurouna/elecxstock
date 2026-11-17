// 管理者のポリシー（docs/design-news.md §3.2）: HKLM\Software\Policies\elecxstock の News=0 でニュースを止める。
// ネイティブのモジュールは使わず reg.exe を呼ぶ（Windows だけ。読めなければポリシーなし）。インストール先のファイルは使わない（利用者が書けるため）
import { execFile } from 'node:child_process'

export const POLICY_KEY = 'HKLM\\Software\\Policies\\elecxstock'

type Exec = (file: string, args: string[], cb: (err: Error | null, stdout: string) => void) => void
const realExec: Exec = (file, args, cb) =>
  void execFile(file, args, { timeout: 3000, windowsHide: true }, (err, stdout) => cb(err, String(stdout)))

/** reg query の出力から、ニュースを止めるか（News が 0） */
export function policyOffFromReg(stdout: string): boolean {
  const m = /^\s*News\s+REG_(DWORD|SZ)\s+(\S+)\s*$/im.exec(stdout)
  if (!m) return false
  const v = m[1]!.toUpperCase() === 'DWORD' ? Number.parseInt(m[2]!, 16) : Number(m[2])
  return v === 0
}

/** ニュースを止めるか（環境変数 ELECXSTOCK_NEWS=off・レジストリ）。3 秒で諦める */
export function readNewsPolicy(env: Record<string, string | undefined>, platform: string, exec: Exec = realExec): Promise<boolean> {
  if (env.ELECXSTOCK_NEWS === 'off') return Promise.resolve(true)
  if (platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    exec('reg.exe', ['query', POLICY_KEY, '/v', 'News'], (err, stdout) => resolve(!err && policyOffFromReg(stdout)))
  })
}
