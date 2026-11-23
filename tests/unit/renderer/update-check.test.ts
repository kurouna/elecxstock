// 新しい版の確認の状態と、設定画面に出す 1 行（NFR-Q9。L1）
import { checkResult, updateLine } from '@renderer/lib/updateCheck'
import { describe, expect, it } from 'vitest'

describe('新しい版の確認の結果（NFR-Q9）', () => {
  it('Core の応答を状態にする（null は確かめられなかった）', () => {
    expect(checkResult(null)).toEqual({ state: 'failed' })
    expect(checkResult({ version: '0.1.20', url: 'u', newer: false })).toEqual({ state: 'latest', version: '0.1.20' })
    expect(checkResult({ version: '0.1.21', url: 'u', newer: true })).toEqual({ state: 'newer', version: '0.1.21', url: 'u' })
  })
  it('設定画面の 1 行: まだ確かめていなければ出さない。最新のときは版を添える', () => {
    expect(updateLine(null)).toBeNull()
    expect(updateLine({ state: 'checking' })).toEqual({ key: 'update.checking' })
    expect(updateLine({ state: 'latest', version: '0.1.20' })).toEqual({ key: 'update.latestIs', args: { v: '0.1.20' } })
    expect(updateLine({ state: 'newer', version: '0.1.21', url: 'u' })).toEqual({ key: 'update.available', args: { v: '0.1.21' } })
    expect(updateLine({ state: 'failed' })).toEqual({ key: 'update.failed' })
  })
})
