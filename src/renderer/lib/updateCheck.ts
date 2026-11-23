// 新しい版の確認（NFR-Q9）の状態と、設定画面に出す 1 行。トーストは暗転の向こうで見えにくいので、設定画面からは画面の中に出す
import type { Key } from './i18n'

export type UpdateCheck =
  | { state: 'checking' }
  | { state: 'latest'; version: string }
  | { state: 'newer'; version: string; url: string }
  | { state: 'failed' }

/** Core の応答（null は確かめられなかった）を状態にする */
export function checkResult(r: { version: string; url: string; newer: boolean } | null): UpdateCheck {
  if (!r) return { state: 'failed' }
  return r.newer ? { state: 'newer', version: r.version, url: r.url } : { state: 'latest', version: r.version }
}

/** 設定画面の 1 行の文言（キーと値）。まだ確かめていなければ null */
export function updateLine(c: UpdateCheck | null): { key: Key; args?: Record<string, string> } | null {
  if (!c) return null
  if (c.state === 'checking') return { key: 'update.checking' }
  if (c.state === 'latest') return { key: 'update.latestIs', args: { v: c.version } }
  if (c.state === 'newer') return { key: 'update.available', args: { v: c.version } }
  return { key: 'update.failed' }
}
