// 数値・日付の書式（FR-N3, FR-V2）。言語に合わせて Intl で書く。
import { app } from '../stores/app.svelte'
import { MASK, privacy } from './privacy.svelte'

const loc = () => (app.settings.lang === 'ja' ? 'ja-JP' : 'en-US')
/** 小数 digits 桁で丸めて 0 になる値（−0.001 を「-0.00」と書かないため） */
const roundsToZero = (v: number, digits: number) => Math.round(Math.abs(v) * 10 ** digits) === 0
export function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const x = roundsToZero(v, digits) ? 0 : v
  return x.toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
/** 価格。桁を渡さなければ 1,000 未満は小数 1 桁、それ以上は整数（分割調整後の端数も揃える）。マーケット一覧の行は登録表の桁（FR-MB2。priceDigits） */
export function px(v: number | null | undefined, digits?: number): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = digits ?? (Math.abs(v) < 1000 ? 1 : 0)
  return fmt(v, d)
}
export function sgn(v: number | null | undefined, digits = 2, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = roundsToZero(v, digits) ? '±' : v > 0 ? '+' : '−'
  return `${s}${fmt(Math.abs(v), digits)}${suffix}`
}
/** 騰落率の短い書式（銘柄情報の値動き）。100% 未満は小数 1 桁、100% 以上は整数（狭いカードでも 3 桁の % が収まる。FR-V12） */
export function retText(v: number | null | undefined): string {
  return sgn(v, v != null && Math.abs(v) >= 100 ? 0 : 1, '%')
}
/** 増減の色（--up / --down）。数でない値（欠損・NaN・Infinity）は色を付けない */
export function cls(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
}
/** 個人の金額（保有の評価額・損益・配当）の money。プライバシーモードでは単位ごと隠す（単位で桁が分かるため。FR-H12） */
export const ownMoney = (v: number | null | undefined): { n: string; u: string } => (privacy.on ? { n: MASK, u: '' } : money(v))
/** 符号つきの個人の金額（評価損益・前日比）。プライバシーモードでは符号ごと隠す（ほかの損益の欄と同じ。FR-H12） */
export function ownSignedMoney(v: number | null | undefined): { n: string; u: string } {
  if (privacy.on) return { n: MASK, u: '' }
  if (v == null || !Number.isFinite(v)) return { n: '—', u: '' }
  const m = money(Math.abs(v))
  return { n: `${!/[1-9]/.test(m.n) ? '±' : v > 0 ? '+' : '−'}${m.n}`, u: m.u }
}
/** 金額（億円・兆円 / ¥B・¥T）。単位は小さく添える（FR-V2） */
export function money(v: number | null | undefined): { n: string; u: string } {
  if (v == null || !Number.isFinite(v)) return { n: '—', u: '' }
  const a = Math.abs(v)
  if (app.settings.lang === 'ja') {
    if (a >= 1e12) return { n: fmt(v / 1e12, 2), u: '兆' }
    if (a >= 1e8) return { n: fmt(v / 1e8, a >= 1e10 ? 0 : 1), u: '億' }
    return { n: fmt(v / 1e4, 0), u: '万' }
  }
  if (a >= 1e12) return { n: `¥${fmt(v / 1e12, 2)}`, u: 'T' }
  if (a >= 1e9) return { n: `¥${fmt(v / 1e9, 1)}`, u: 'B' }
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
  if (Number.isNaN(d.getTime())) return '—'
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
