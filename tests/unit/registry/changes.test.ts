// 利用者のデータを書くメソッドの登録表（CHANGES・SCREEN_REBASE）の網羅（FR-W・FR-AL2。docs/testing.md の L2）。
// API にメソッドを足すと、ここで「ほかの窓に知らせるか」「スクリーンのアラートの基準を取り直すか」の分類を求められる
import { CHANGES } from '@core/changes'
import { SCREEN_REBASE } from '@core/service'
import { PARAMS } from '@shared/api'
import { describe, expect, it } from 'vitest'

/** 利用者のデータを書くメソッド（名前の形で見分ける） */
const WRITES = Object.keys(PARAMS).filter((m) =>
  /^(user\.(save|import|undo)|watchlists\.|portfolio\.(save|apply|undo)|alerts\.(save|remove|restore|setEnabled|markRead)|instruments\.(add|remove)User|jobs\.applyRetention|folio\.clear)/.test(
    m,
  ),
)
/** 書くが、ほかの窓に知らせないメソッドと理由 */
const NO_NOTICE: Record<string, string> = {
  'user.saveLayout': 'レイアウトは窓ごと（1 枚目だけが持つ）',
  'user.saveLayouts': '名前を付けたレイアウトは 1 枚目だけが使う',
  'user.saveWindowLayout': 'フリー N は自分の配置だけを書く',
  'alerts.markRead': '既読は 1 枚目のベルだけが使う',
}
/** ほかの窓に知らせるが、スクリーンのアラートの基準をここでは取り直さないメソッドと理由 */
const NO_REBASE: Record<string, string> = {
  'user.saveSettings': '設定の利用者の銘柄は Core が持ち、renderer の保存では変わらない',
  'jobs.applyRetention': '保存期間は対象の銘柄を変えない',
  'folio.clear': '資産推移の記録はスクリーンの条件に使わない',
  'alerts.save': 'アラートの保存は、保存したアラートの基準だけを取り直す',
  'alerts.remove': 'アラートを消すだけ',
  'alerts.restore': '戻したアラートは id と状態を保つ',
  'alerts.setEnabled': '再開は、そのアラートの基準だけを取り直す',
  'user.importAll': '取り込みは、すべてのアラートの基準を取り直す（rebaseAllAlerts）',
  'user.undoImport': '元に戻すは、すべてのアラートの基準を取り直す（rebaseAllAlerts）',
}

describe('利用者のデータを書くメソッドの分類（FR-W, FR-AL2）', () => {
  it('書くメソッドは、ほかの窓に知らせる（CHANGES）か、知らせない理由がある', () => {
    expect(WRITES.length).toBeGreaterThan(15)
    for (const m of WRITES) expect(m in CHANGES || m in NO_NOTICE, m).toBe(true)
  })
  it('登録表のメソッドは API に実在する', () => {
    for (const m of [...Object.keys(CHANGES), ...Object.keys(SCREEN_REBASE), ...Object.keys(NO_NOTICE), ...Object.keys(NO_REBASE)])
      expect(m in PARAMS, m).toBe(true)
  })
  it('知らせるメソッドは、スクリーンのアラートの基準を取り直す（SCREEN_REBASE）か、取り直さない理由がある', () => {
    for (const m of Object.keys(CHANGES)) expect(m in SCREEN_REBASE || m in NO_REBASE, m).toBe(true)
  })
  it('★・ウォッチリスト・保有・スクリーンを書くメソッドは、スクリーンのアラートの基準を取り直す', () => {
    for (const [m, kind] of Object.entries(CHANGES))
      if (kind === 'watchlists' || kind === 'holdings' || kind === 'screens') expect(SCREEN_REBASE[m], m).toBeTruthy()
  })
  it('取り込み・元に戻す・銘柄の追加と削除・保存期間・スクリーンの種類', () => {
    expect(CHANGES['user.importAll']).toBe('all')
    expect(CHANGES['user.undoImport']).toBe('all')
    expect(CHANGES['instruments.addUser']).toBe('settings')
    expect(CHANGES['instruments.removeUser']).toBe('settings')
    expect(CHANGES['jobs.applyRetention']).toBe('settings')
    expect(CHANGES['user.saveScreens']).toBe('screens')
  })
})
