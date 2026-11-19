// main の IPC・プロトコルの判断（Electron に依存しない純関数。単体テストで確かめる。placement.ts と同じ流儀）
import { isAbsolute, join, normalize, relative, sep } from 'node:path'

/** 外部のブラウザで開いてよい URL（ニュースの記事のホストは別に index.ts が足す） */
export const EXTERNAL_ALLOW: readonly RegExp[] = [
  /^https:\/\/(www\.)?tradingview\.com\//,
  // リポジトリの名前のあとは / か ? か # か終わり（elecxstock-evil のような別のリポジトリを通さない）
  /^https:\/\/github\.com\/kurouna\/elecxstock(?=[/?#]|$)/,
  /^https:\/\/(www\.)?jpx\.co\.jp\//,
  /^https:\/\/finance\.yahoo\.co(m|\.jp)\//,
]

/** 外部のブラウザで開いてよいか。ブラウザと同じく正規化（.. のセグメント・%2e の解決）してから確かめる */
export function isExternalAllowed(url: string): boolean {
  let href: string
  try {
    href = new URL(url).href
  } catch {
    return false
  }
  return EXTERNAL_ALLOW.some((r) => r.test(href))
}

/**
 * app:// の要求のパスを、root の中のファイルのパスにする。デコードできない（不正な % の並び）・root の外・root そのものは null。
 * ファイルかどうか（ディレクトリでないか）は呼んだ側が確かめる
 */
export function appFilePath(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const base = normalize(root)
  const p = normalize(join(base, decoded))
  const rel = relative(base, p)
  // root の外は .. のセグメント（..foo.js のような名前は root の中）
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  return p
}

/** Ctrl+F6 の行き先: 開いている窓の並びで from の次（dir = -1 は前）。開いている窓が無ければ null */
export function cycleSlot<S extends string>(open: readonly S[], from: S | null, dir: unknown): S | null {
  if (!open.length) return null
  const i = from == null ? -1 : open.indexOf(from)
  const step = dir === -1 ? -1 : 1
  // from が並びに無いとき（閉じかけの窓）は、先頭（前へなら末尾）から
  if (i < 0) return step === 1 ? open[0]! : open[open.length - 1]!
  return open[(i + step + open.length) % open.length]!
}
