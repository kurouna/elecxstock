// パフォーマンス比較の画面の文言を組む（docs/design-perf.md §2.2・§2.4・§3.3）。計算は lib/perf.ts、ここは状態から文字へ
import type { InstrumentId, JstDate } from '@shared/types'
import { app, t } from '../stores/app.svelte'
import { annualized, type Indexed, isBench, maxDrawdown, type PfFrame, type PfMode, type PfState, pfValue, shortName, slash } from './perf'

/** 短い名前（言語に合わせる） */
export function shortOf(id: InstrumentId): string {
  const i = app.instruments.get(id)
  if (!i) return id.replace(/^JP:/, '')
  return shortName(app.settings.lang === 'en' && i.nameEn ? i.nameEn : i.nameJa)
}
/** 線を描かない理由（§3.3）。描けるなら null */
export function stateReason(s: PfState | undefined): string | null {
  if (!s) return t('pf.loading')
  switch (s.kind) {
    case 'ok':
      return null
    case 'pending':
      return t('pf.pending')
    case 'gap':
      return t('pf.gap')
    case 'before':
      return s.first ? t('pf.before', { m: slash(s.first).slice(0, 7) }) : t('pf.noData')
  }
}
/** 左上の注意の 1 行: 寄せた理由と配当込みの範囲（§2.2） */
export function frameNotes(f: PfFrame, typed: JstDate, divFrom: JstDate | null): { text: string; warn: boolean } {
  const parts: string[] = []
  if (f.reason === 'monthly') parts.push(t('pf.monthlyNote', { m: slash(f.base).slice(0, 7), d: slash(typed) }))
  else if (f.reason === 'holiday') parts.push(t('pf.holiday', { d: slash(typed) }))
  if (divFrom) parts.push(t('pf.divNote', { m: slash(divFrom).slice(0, 7) }))
  return { text: parts.join(' · '), warn: f.reason === 'monthly' || !!divFrom }
}
/** 値の色（% のときだけ騰落の色） */
export const toneOf = (v: number | undefined, mode: PfMode): string =>
  mode !== 'pct' || v == null ? '' : v - 100 > 0.05 ? 'up' : v - 100 < -0.05 ? 'down' : ''
/** 選んだ行の詳細（§2.4）: 終わりの日までの騰落率・年率・最大下落率・最新の足が古いとき */
export function detailParts(
  line: Indexed | undefined,
  s: PfState | undefined,
  f: PfFrame,
): { parts: { label: string; value: string; tone?: string }[]; warn: string | null } {
  const why = stateReason(s)
  if (why || !line || s?.kind !== 'ok') return { parts: [], warn: why ?? t('pf.noData') }
  const last = line.v.at(-1)!
  const endDay = line.t.at(-1)!
  const parts: { label: string; value: string; tone?: string }[] = [
    { label: t('pf.until', { d: slash(endDay).slice(2) }), value: pfValue(last, 'pct'), tone: toneOf(last, 'pct') },
  ]
  const ann = annualized(last, f.base, endDay)
  if (ann != null) parts.push({ label: t('pf.cagr'), value: `${ann > 0 ? '+' : ann < 0 ? '−' : ''}${Math.abs(ann).toFixed(1)}%` })
  const dd = maxDrawdown(line.v)
  parts.push({ label: f.monthly ? t('pf.mddMonthly') : t('pf.mdd'), value: dd < 0 ? `−${Math.abs(dd).toFixed(1)}%` : '0.0%' })
  if (s.from) parts.push({ label: t('pf.fromBar', { d: slash(s.from).slice(5) }), value: '' })
  if (s.last) parts.push({ label: t('pf.lastBar', { d: slash(s.last).slice(5) }), value: '' })
  return { parts, warn: null }
}
/** 比較の組の既定の名前（「2024/08/05 から トヨタ・ソニー」） */
export function setName(base: JstDate, ids: readonly InstrumentId[]): string {
  return t('pf.setName', {
    d: slash(base),
    names:
      ids
        .filter((x) => !isBench(x))
        .map(shortOf)
        .join('・') || '—',
  })
}
