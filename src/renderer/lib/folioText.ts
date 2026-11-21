// ポートフォリオのペインの文言（分類の名前・1 行の要約・予定）。言い方は i18n の folio.* に持つ（design-portfolio.md §4.3 の用語）
import { SECTOR17_EN, type Sector17 } from '@shared/sectors'
import type { AccountType } from '@shared/types'
import { app, t } from '../stores/app.svelte'
import { type briefOf, lotCount, manYen, signPct } from './folio'
import type { Key } from './i18n'
import { accountName } from './portfolio'

/** 分類の鍵（groupKey）の名前 */
export function groupLabel(key: string): string {
  if (key.startsWith('kind:')) return t(`folio.kind.${key.slice(5)}` as Key)
  if (key.startsWith('acct:')) return accountName(key.slice(5) as AccountType)
  if (key.startsWith('market:')) return t(`mkt.${key.slice(7)}` as Key)
  if (app.settings.lang === 'en' && key in SECTOR17_EN) return SECTOR17_EN[key as Sector17]
  return key
}
/** 1 行の要約（数値から決まった型で作る。言い回しは変えない） */
export function briefText(b: ReturnType<typeof briefOf>): string {
  if (!b) return ''
  const parts = [t('folio.briefYear', { v: manYen(b.total, true), d: manYen(b.div, true) })]
  if (b.top) parts.push(t('folio.briefTop', { code: b.top.code, name: b.top.name, v: manYen(b.top.v, true) }))
  if (b.divPct != null) parts.push(t('folio.briefDiv', { p: signPct(b.divPct) }))
  return parts.join(app.settings.lang === 'ja' ? '' : ' ')
}
/** 分類の行の中身の数（銘柄コードで数える。口座ごとに分けて同じ銘柄が複数の行なら口座の数も） */
export function lotText(rs: { code: string; acct?: AccountType }[]): string {
  const c = lotCount(rs)
  return c.lots > c.n ? t('folio.nLots', { n: c.n, l: c.accts }) : t('folio.nStocks', { n: c.n })
}
/** 閉じた分類の行の構成の文字（上位 3 銘柄の名前と割合。残りは「ほか n」） */
export function compText(comp: { name: string; share: number }[], top = 3): string {
  const head = comp
    .slice(0, top)
    .map((c) => `${c.name} ${(c.share * 100).toFixed(0)}%`)
    .join(' · ')
  return comp.length > top ? `${head} ${t('folio.compMore', { n: comp.length - top })}` : head
}
