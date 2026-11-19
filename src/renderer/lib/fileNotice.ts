// main のファイルの読み書きの結果を利用者に知らせる（取りやめは黙り、失敗はエラーのトースト）。
// 書き出し・取り込みの各所（commands.ts・portfolio.ts・設定と初回の JPX の取り込み）が共有する
import type { OpenFileFailure, SaveFileResult } from '@shared/bridge'
import { t, toast } from '../stores/app.svelte'

const FAIL_MS = 6000

/** 書けたら done を知らせ（あれば）、書けなかったらエラーで知らせる。書けたか */
export function noticeSave(r: SaveFileResult, done?: string): boolean {
  if (r === 'saved' && done) toast(done)
  else if (r === 'failed') toast(t('file.saveFailed'), undefined, FAIL_MS, 'error')
  return r === 'saved'
}

/** 開いたファイルの中身。取りやめは null、読めなかったら知らせて null */
export function noticeOpen<T extends string | Uint8Array>(r: T | null | OpenFileFailure): T | null {
  if (r != null && typeof r === 'object' && 'error' in r) {
    toast(t(r.error === 'too-large' ? 'file.tooLarge' : 'file.openFailed'), undefined, FAIL_MS, 'error')
    return null
  }
  return r
}
