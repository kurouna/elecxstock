// 新しい版の確認の状態と、設定画面に出す 1 行（NFR-Q9。L1）
import { checkResult, updateBusy, updateLine, updateLink } from '@renderer/lib/updateCheck'
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
  it('ダウンロードのページへのリンク: 新しい版を知っていて、今の結果と食い違わないときだけ出す', () => {
    const upd = { version: '0.1.21', url: 'u' }
    // 新しい版を知らなければ出さない
    expect(updateLink(null, null)).toBeNull()
    expect(updateLink({ state: 'failed' }, null)).toBeNull()
    // 起動時の確認で知った（設定画面ではまだ確かめていない）: 版を添えて出す
    expect(updateLink(null, upd)).toEqual({ key: 'update.available', args: { v: '0.1.21' } })
    // 確かめて新しい版があった: 1 行目が版を出すので、リンクは「ダウンロードのページ」
    expect(updateLink({ state: 'newer', version: '0.1.21', url: 'u' }, upd)).toEqual({ key: 'update.open' })
    // 確かめ直している・確かめられなかった・最新だった: 前のリンクを並べない（「確かめられませんでした」の横に出さない）
    expect(updateLink({ state: 'checking' }, upd)).toBeNull()
    expect(updateLink({ state: 'failed' }, upd)).toBeNull()
    expect(updateLink({ state: 'latest', version: '0.1.21' }, upd)).toBeNull()
  })
  it('確かめている間だけ「押せない」にする', () => {
    expect(updateBusy({ state: 'checking' })).toBe(true)
    for (const c of [null, { state: 'failed' } as const, { state: 'latest', version: '1' } as const]) expect(updateBusy(c)).toBe(false)
  })
})
