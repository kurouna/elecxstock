// このウィンドウが主（main）か、タブなしのフリー N（free2〜free4）か（マルチモニタ、docs/design-multimonitor.md）。
// main が URL（?w=free2&shape=grid）で渡す。テスト（Node）では location が無いので主として扱う
import type { WidgetId } from '../stores/layout.svelte'

export type Slot = 'main' | 'free2' | 'free3' | 'free4'
const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const w = q.get('w') ?? ''
export const SLOT: Slot = /^free[2-4]$/.test(w) ? (w as Slot) : 'main'
export const IS_FREE = SLOT !== 'main'
/** 開くときに選んだ初期の形（grid・quad・detail・empty）。無ければ前回の配置 */
export const SHAPE = q.get('shape')
/** フリー N の番号（2〜4） */
export const freeNo = (s: string) => Number(s.replace('free', ''))
/** フリー N に置けるペイン: チャートを並べるものだけ（一覧を置かず、利用者のデータを編集しない） */
export const FREE_WIDGETS: WidgetId[] = ['chart', 'mtf', 'grid', 'info']
/** フリー N では使わないアクション（タブ・ドロワー・設定・利用者のデータの編集は 1 枚目で） */
export function blockedInFree(id: string): boolean {
  return (
    /^layout\./.test(id) ||
    [
      'layouts',
      'resetAllLayouts',
      'alerts',
      'settings',
      'data',
      'keys',
      'lang',
      'theme',
      'candle',
      'density',
      'screens',
      'drawer',
      'drawerRight',
      'drawerPin',
      'toDrawer',
      'toDrawerRight',
      'fromDrawer',
      'openGrid',
      'addTo',
      'newList',
      'duplicateList',
      'limit',
      'importCodes',
      'exportUser',
      'importUser',
      'portfolio',
      'importBrokerCsv',
      'exportHoldings',
      'importHoldings',
      'undoHoldings',
      'backupDb',
      'checkUpdate',
      'universe',
      'sendToFree',
      'jobs',
    ].includes(id)
  )
}
