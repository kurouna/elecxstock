// 数値・日付の書式（FR-N3, FR-V2）。言語に合わせて Intl で書く。
import { app } from '../stores/app.svelte'

const loc = () => (app.settings.lang === 'ja' ? 'ja-JP' : 'en-US')
export function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
/** 価格: 1,000 未満は小数 1 桁、それ以上は整数（分割調整後の端数も揃える） */
export function px(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = Math.abs(v) < 1000 ? 1 : 0
  return v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d })
}
export function sgn(v: number | null | undefined, digits = 2, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${s}${Math.abs(v).toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`
}
/** 騰落率の短い書式（銘柄情報の値動き）。100% 未満は小数 1 桁、100% 以上は整数（狭いカードでも 3 桁の % が収まる。FR-V12） */
export function retText(v: number | null | undefined): string {
  return sgn(v, v != null && Math.abs(v) >= 100 ? 0 : 1, '%')
}
export function cls(v: number | null | undefined): string {
  return v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
}
/** 金額（億円・兆円 / ¥B・¥T）。単位は小さく添える（FR-V2） */
export function money(v: number | null | undefined): { n: string; u: string } {
  if (v == null || !Number.isFinite(v)) return { n: '—', u: '' }
  if (app.settings.lang === 'ja') {
    if (Math.abs(v) >= 1e12) return { n: fmt(v / 1e12, 2), u: '兆' }
    if (Math.abs(v) >= 1e8) return { n: fmt(v / 1e8, v >= 1e10 ? 0 : 1), u: '億' }
    return { n: fmt(v / 1e4, 0), u: '万' }
  }
  if (Math.abs(v) >= 1e12) return { n: `¥${fmt(v / 1e12, 2)}`, u: 'T' }
  if (Math.abs(v) >= 1e9) return { n: `¥${fmt(v / 1e9, 1)}`, u: 'B' }
  return { n: `¥${fmt(v / 1e6, 1)}`, u: 'M' }
}
export function date(d: string | null | undefined): string {
  if (!d) return '—'
  if (app.settings.lang === 'ja') return d.slice(0, 10).replaceAll('-', '/')
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(loc(), {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: app.settings.lang === 'ja' ? '2-digit' : 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
