// 利回りの変化の内訳の文言（docs/design-yield-breakdown.md §3.3・§4。FR-I11）: 一言の文・増減率と pt の書き方・配当と分配金の言い分け。判定の言葉は使わない
import type { YieldCaption } from '@shared/yieldPath'
import { t } from '../stores/app.svelte'
import type { Key } from './i18n'

/** 増減率（比率）を「+6%」「−22%」「±0%」で */
export function ratePct(v: number): string {
  const p = Math.round(v * 100)
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}%`
}
/** 利回り（比率）を「5.59%」で */
export const yieldPct = (v: number): string => `${(v * 100).toFixed(2)}%`
/** 利回りの差（% ポイント）を「+0.42 pt」「−1.10 pt」「±0.00 pt」で（丸めて 0 なら符号を付けない） */
export function ptText(v: number): string {
  const s = Math.abs(v).toFixed(2)
  return `${Number(s) === 0 ? '±' : v > 0 ? '+' : '−'}${s} pt`
}
/** 月（YYYY-MM）を「2024/03」で */
export const ym = (m: string): string => m.replace('-', '/')

/** 文言に配当・分配金の言葉（{div}・{unit}）を入れる。REIT は分配金（§4） */
export function ydT(key: Key, reit = false, args: Record<string, string | number> = {}): string {
  return t(key, { div: t(reit ? 'yd.wd.divReit' : 'yd.wd.div'), unit: t(reit ? 'yd.wd.unitReit' : 'yd.wd.unit'), ...args })
}

/** 一言の文 */
export function captionText(c: YieldCaption, reit = false): string {
  if (c.kind === 'flat') return ydT('yd.c.flat', reit)
  if (c.kind === 'same') return ydT('yd.c.same', reit, { d: ratePct(c.dD), p: ratePct(c.dP) })
  const dir = t(c.up ? 'yd.up' : 'yd.down')
  if (c.kind === 'both') return ydT('yd.c.both', reit, { dir })
  // 利回りが上がったときは、配当なら増えた・株価なら下がった（下がったときはその逆）
  const why = c.by === 'div' ? (c.up ? 'divUp' : 'divDown') : c.up ? 'pxDown' : 'pxUp'
  if (c.kind === 'main') return t('yd.c.main', { dir, why: ydT(`yd.why.${why}`, reit) })
  const other = c.by === 'div' ? (c.up ? 'pxUp' : 'pxDown') : c.up ? 'divDown' : 'divUp'
  return t('yd.c.over', { dir, a: ydT(`yd.w.${why}`, reit), b: ydT(`yd.w.${other}`, reit) })
}
