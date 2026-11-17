// 利用者のデータ（FR-S4, S12）: JSON に版を持ち、一時ファイルに書いてから置き換え、直近 10 世代を残す。
// 読み込み・検証に失敗したら、そのファイルを退避して知らせ、読み取り専用で起動する（空で上書きしない）。
// レイアウトの 2 つのファイルだけは、退避して既定で起動し、書ける状態を保つ（docs/design-mylayouts.md §5.4）。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  alertSchema,
  PAGES_LIMIT,
  type RecoveredFile,
  savedLayoutSchema,
  screenSchema,
  settingsSchema,
  USER_FILE_SCHEMAS,
  watchlistSchema,
} from '@shared/api'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { SavedScreen, Watchlist } from '@shared/types'
import { z } from 'zod'

export const STORE_VERSION = 1
const GENERATIONS = 10

export { DEFAULT_SETTINGS }

export function defaultWatchlists(): Watchlist[] {
  return [
    { id: 'favorites', builtin: 'favorites', name: { ja: '★お気に入り', en: '★ Favorites' }, items: [] },
    { id: 'candidates', builtin: 'candidates', name: { ja: '◆売買候補', en: '◆ Candidates' }, items: [] },
    { id: 'income', name: { ja: '高配当', en: 'High yield' }, items: [] },
    { id: 'watch', name: { ja: '監視', en: 'Watch' }, items: [] },
  ]
}

/**
 * 既定のスクリーン（FR-SC15）。ID は利用者のファイルに残るので変えない（既定を戻す操作は ID で見る）。
 * 値を変えても、すでに入っている利用者のスクリーンは変わらない（新しく入れたとき・消して戻したときに効く）。
 */
export function defaultScreens(now = Date.now()): SavedScreen[] {
  const s = (id: string, ja: string, en: string, conditions: SavedScreen['conditions']): SavedScreen => ({
    id,
    name: { ja, en },
    conditions,
    created: now,
    updated: now,
  })
  return [
    s('high-yield', '高配当銘柄', 'High yield', [
      { field: 'income.yield', op: '>=', value: 4 },
      { field: 'liq.turnover20', op: '>=', value: 1e9 },
      { field: 'attr.market', op: 'in', value: ['P', 'R'] },
    ]),
    // 東証の「資本コストや株価を意識した経営」の要請で、PBR 1 倍割れの改善が注目される。稼ぐ力（ROE 8%。伊藤レポートの目安）がある銘柄に絞る
    s('value', '割安（PBR 1 倍割れ・ROE 8%）', 'Value (P/B < 1, ROE ≥ 8%)', [
      { field: 'value.pbr', op: '<=', value: 1 },
      { field: 'value.roe', op: '>=', value: 8 },
      { field: 'liq.turnover20', op: '>=', value: 5e8 },
    ]),
    s('jreit-yield', 'J-REIT 高利回り', 'J-REIT high yield', [
      { field: 'attr.market', op: 'in', value: ['R'] },
      { field: 'income.yield', op: '>=', value: 5 },
    ]),
    s('near-high', '52週高値圏', 'Near 52W high', [
      { field: 'tech.fromHi52', op: '>=', value: -3 },
      { field: 'tech.maDev75', op: '>=', value: 0 },
    ]),
    // 新 NISA の成長投資枠で長く持つ: 増配が続き、配当に無理が無い
    s('div-growth', '連続増配', 'Dividend growers', [
      { field: 'income.divUpYears', op: '>=', value: 3 },
      { field: 'income.yield', op: '>=', value: 3 },
      { field: 'income.payout', op: '<=', value: 70 },
    ]),
    // 株式分割と東証の投資単位の引き下げの要請で、少額で買える銘柄が増えた
    s('small-lot', '10万円以下で買える高配当', 'High yield under ¥100k', [
      { field: 'price.minInvest', op: '<=', value: 1e5 },
      { field: 'income.yield', op: '>=', value: 3.5 },
      { field: 'liq.turnover20', op: '>=', value: 1e8 },
    ]),
    // 相場が大きく振れる局面の守り: 値動きが小さく、日経平均に連れにくい
    s('low-vol', '低ボラティリティ・ディフェンシブ', 'Low volatility', [
      { field: 'risk.vol60', op: '<=', value: 20 },
      { field: 'risk.beta', op: '<=', value: 0.6 },
      { field: 'income.yield', op: '>=', value: 3 },
      { field: 'liq.turnover20', op: '>=', value: 5e8 },
    ]),
    // 長期の上昇（200 日線の上）が続く中での一時的な下げ
    s('pullback', '上昇トレンドの押し目', 'Pullback in uptrend', [
      { field: 'tech.maDev200', op: '>=', value: 0 },
      { field: 'tech.maDev25', op: '<=', value: -3 },
      { field: 'tech.rsi14', op: '<=', value: 40 },
      { field: 'liq.turnover20', op: '>=', value: 1e9 },
    ]),
  ]
}

const S = USER_FILE_SCHEMAS
const FILES = {
  settings: { schema: S.settings, def: () => DEFAULT_SETTINGS },
  watchlists: { schema: S.watchlists, def: defaultWatchlists },
  screens: { schema: S.screens, def: () => defaultScreens() },
  layout: { schema: S.layout, def: () => null },
  layouts: { schema: S.layouts, def: () => [] },
  holdings: { schema: S.holdings, def: () => [] },
  portfolioMeta: { schema: S.portfolioMeta, def: () => null },
  alerts: { schema: S.alerts, def: () => [] },
  /** チャートの描画（docs/design-drawings.md §7）。銘柄 → 図形 */
  drawings: { schema: S.drawings, def: () => ({}) },
} as const
/** レイアウトは作業に追従して頻繁に保存されるので、世代は 10 分に 1 つだけ残す */
const LAYOUT_GEN_MS = 10 * 60_000
type Name = keyof typeof FILES
/**
 * 読み損なったら退避して既定（layout は null、layouts は []）で起動するファイル。レイアウトが読めないだけで、
 * ウォッチリスト・保有・アラートまで保存できなくなるのを避ける。退避に失敗したときは、ほかのファイルと同じく読み取り専用
 */
const RECOVERABLE: ReadonlySet<Name> = new Set<Name>(['layout', 'layouts'])
/** ページの ID・名前・並び。変わった保存は必ず世代を残す（中身だけの変更はレイアウトと同じく間引く） */
const pagesShape = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v.map((x: { id?: unknown; name?: unknown }) => [x.id, x.name])) : '')

export class UserStore {
  readOnly = false
  error: string | undefined
  /** 読み損なって退避したレイアウトのファイル（user.load で返す） */
  readonly recovered: RecoveredFile[] = []
  private cache = new Map<Name, unknown>()
  private lastGen = new Map<Name, number>()
  constructor(readonly dir: string) {
    mkdirSync(join(dir, 'backups'), { recursive: true })
  }
  private path(n: Name) {
    return join(this.dir, `${n}.json`)
  }
  load<N extends Name>(n: N): z.infer<(typeof FILES)[N]['schema']> {
    if (this.cache.has(n)) return this.cache.get(n) as never
    const f = FILES[n]
    const p = this.path(n)
    let value: unknown = f.def()
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8')) as { version?: unknown; data?: unknown } | null
        const version = raw && typeof raw === 'object' && typeof raw.version === 'number' ? raw.version : 0
        if (version > STORE_VERSION) {
          // 新しい版が書いたファイル: 作り直さず（退避も既定もせず）、読み取り専用で起動する
          this.readOnly = true
          this.error = `${n}.json: version ${version} > ${STORE_VERSION}`
        } else {
          const data = migrate(n, version, raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw)
          value = n === 'layouts' && Array.isArray(data) ? this.loadPages(p, data) : parse(f.schema, n, data)
        }
      } catch (e) {
        value = this.broken(n, p, e as Error)
      }
    }
    if (n === 'watchlists') value = ensureBuiltins(value as Watchlist[])
    this.cache.set(n, value)
    return value as never
  }
  /** 壊れたファイルを退避する（rename、だめなら copy）。レイアウトは退避できたら既定で続け、ほかは読み取り専用（FR-S12） */
  private broken(n: Name, p: string, e: Error): unknown {
    const name = `${n}.broken-${Date.now()}.json`
    const q = join(this.dir, 'backups', name)
    let kept = false
    try {
      renameSync(p, q)
      kept = true
    } catch {
      try {
        copyFileSync(p, q)
        kept = true
      } catch {
        /* 退避できない: 書ける状態で起動すると、次の保存で元を上書きしてしまう */
      }
    }
    this.prune(`${n}.broken-`)
    if (kept && RECOVERABLE.has(n)) this.recovered.push({ file: n as RecoveredFile['file'], backup: name })
    else {
      this.readOnly = true
      this.error = `${n}.json: ${e.message}`
    }
    return FILES[n].def()
  }
  /** ページ（layouts.json）は要素ごとに確かめ、通らない要素だけを除く。除いたら元のファイルを間引かれない名前で写しておく */
  private loadPages(p: string, data: unknown[]): unknown[] {
    const { ok, dropped } = pickPages(data)
    if (!dropped) return ok
    const name = `layouts.dropped-${Date.now()}.json`
    try {
      copyFileSync(p, join(this.dir, 'backups', name))
      this.recovered.push({ file: 'layouts', backup: name, dropped })
    } catch (e) {
      this.readOnly = true
      this.error = `layouts.json: ${(e as Error).message}`
    }
    this.prune('layouts.dropped-')
    return ok
  }
  /** 退避ファイルも、種類ごとに直近 10 個まで残す */
  private prune(prefix: string): void {
    try {
      const dir = join(this.dir, 'backups')
      const old = readdirSync(dir)
        .filter((f) => f.startsWith(prefix))
        .sort()
      for (const f of old.slice(0, Math.max(0, old.length - GENERATIONS))) rmSync(join(dir, f), { force: true })
    } catch {
      /* best effort */
    }
  }
  /** opts.generation: 間引かずに必ず世代を残す（取り込み・元に戻す） */
  save<N extends Name>(n: N, value: z.infer<(typeof FILES)[N]['schema']>, opts: { generation?: boolean } = {}): void {
    if (this.readOnly) throw Object.assign(new Error('read-only'), { code: 'read-only' })
    const parsed = FILES[n].schema.parse(value)
    const p = this.path(n)
    const body = JSON.stringify({ version: STORE_VERSION, data: parsed }, null, 1)
    if (existsSync(p) && readFileSync(p, 'utf8') === body) return
    // 世代を残す（直近 10）。レイアウトと、ページの中身だけが変わった保存は 10 分に 1 世代
    const thin = n === 'layout' || (n === 'layouts' && pagesShape(this.cache.get(n)) === pagesShape(parsed))
    const throttled = !opts.generation && thin && Date.now() - (this.lastGen.get(n) ?? 0) < LAYOUT_GEN_MS
    if (existsSync(p) && !throttled) {
      this.lastGen.set(n, Date.now())
      // 同じミリ秒に続けて保存すると名前が重なるので、空いている番号までずらす（形は変えない。新しいほど大きい番号）
      const last = this.generations(n)[0]
      let t = Math.max(Date.now(), last ? Number(last.slice(n.length + 1, -5)) + 1 : 0)
      while (existsSync(join(this.dir, 'backups', `${n}.${t}.json`))) t++
      const b = join(this.dir, 'backups', `${n}.${t}.json`)
      try {
        writeFileSync(b, readFileSync(p))
        const old = readdirSync(join(this.dir, 'backups'))
          .filter((f) => f.startsWith(`${n}.`) && /^\D+\.\d+\.json$/.test(f))
          .sort()
        for (const f of old.slice(0, Math.max(0, old.length - GENERATIONS))) rmSync(join(this.dir, 'backups', f), { force: true })
      } catch {
        /* backup is best effort */
      }
    }
    const tmp = `${p}.tmp`
    writeFileSync(tmp, body)
    renameSync(tmp, p) // 一時ファイルに書いてから置き換える（途中で落ちても壊れない）
    this.cache.set(n, parsed)
  }
  /** 世代のファイル名（新しい順） */
  generations(n: Name): string[] {
    try {
      return readdirSync(join(this.dir, 'backups'))
        .filter((f) => f.startsWith(`${n}.`) && /^\D+\.\d+\.json$/.test(f))
        .sort()
        .reverse()
    } catch {
      return []
    }
  }
  /** 取り込みの前の記録を残す（FR-H9: 元に戻せる） */
  keepBefore(n: Name, tag: string): void {
    const p = this.path(n)
    const q = join(this.dir, 'backups', `${n}.${tag}.json`)
    if (existsSync(p)) writeFileSync(q, readFileSync(p))
    else writeFileSync(q, JSON.stringify({ version: STORE_VERSION, data: FILES[n].def() }))
  }
  restoreBefore<N extends Name>(n: N, tag: string): z.infer<(typeof FILES)[N]['schema']> | null {
    const q = join(this.dir, 'backups', `${n}.${tag}.json`)
    if (!existsSync(q)) return null
    const raw = JSON.parse(readFileSync(q, 'utf8')) as { data?: unknown }
    const d = raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw
    // ページは読み込みと同じく 1 件ずつ確かめる（読み込みで除いた要素がファイルに残っていても、取り消しを途中で止めない）
    const v = (n === 'layouts' && Array.isArray(d) ? pickPages(d).ok : FILES[n].schema.parse(d)) as z.infer<(typeof FILES)[N]['schema']>
    this.save(n, v, { generation: true })
    rmSync(q, { force: true })
    return v
  }
  exportAll(): string {
    return JSON.stringify(
      {
        format: 'elecxstock.userdata',
        version: STORE_VERSION,
        exportedAt: new Date().toISOString(),
        settings: this.load('settings'),
        watchlists: this.load('watchlists'),
        screens: this.load('screens'),
        layouts: this.load('layouts'),
        alerts: this.load('alerts'),
        drawings: this.load('drawings'),
      },
      null,
      1,
    )
  }
  importAll(json: string): { watchlists: number; screens: number } {
    const o = JSON.parse(json) as {
      format?: string
      watchlists?: unknown
      screens?: unknown
      settings?: unknown
      layouts?: unknown
      alerts?: unknown
      drawings?: unknown
    }
    if (o.format !== 'elecxstock.userdata') throw new Error('not an elecxstock export')
    // すべて検証してから保存する（途中で失敗して半分だけ入ることが無いように）
    const wl = z.array(watchlistSchema).parse(o.watchlists ?? [])
    const sc = z.array(screenSchema).parse(o.screens ?? [])
    const ly = o.layouts ? S.layouts.parse(o.layouts) : null
    const st = o.settings ? settingsSchema.parse({ ...this.load('settings'), ...(o.settings as object) }) : null
    const al = o.alerts ? z.array(alertSchema).max(500).parse(o.alerts) : null
    const dr = o.drawings ? S.drawings.parse(o.drawings) : null
    // 取り込む前の記録は、置き換えるファイルだけ残す（取り込まないファイルを「元に戻す」で巻き戻さない。前の取り込みの記録も消す）
    const replaced = { watchlists: true, screens: true, layouts: !!ly, settings: !!st, alerts: !!al, drawings: !!dr }
    for (const n of ['watchlists', 'screens', 'layouts', 'settings', 'alerts', 'drawings'] as const)
      if (replaced[n]) this.keepBefore(n, 'preimport')
      else rmSync(join(this.dir, 'backups', `${n}.preimport.json`), { force: true })
    this.save('watchlists', ensureBuiltins(wl))
    this.save('screens', sc.length ? sc : defaultScreens())
    if (ly) this.save('layouts', ly, { generation: true })
    if (st) this.save('settings', st)
    if (al) this.save('alerts', al)
    if (dr) this.save('drawings', dr)
    return { watchlists: wl.length, screens: sc.length }
  }
}

/** ページを 1 件ずつ確かめ、通るものを上限（PAGES_LIMIT）まで残す。除いた数を返す */
function pickPages(data: readonly unknown[]): { ok: unknown[]; dropped: number } {
  const ok: unknown[] = []
  for (const x of data) {
    const r = savedLayoutSchema.safeParse(x)
    if (r.success && ok.length < PAGES_LIMIT) ok.push(r.data)
  }
  return { ok, dropped: data.length - ok.length }
}

function parse(schema: z.ZodType, n: Name, data: unknown): unknown {
  const parsed = schema.safeParse(n === 'settings' ? { ...DEFAULT_SETTINGS, ...(data as object) } : data)
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return parsed.data
}

function ensureBuiltins(list: Watchlist[]): Watchlist[] {
  const out = [...list]
  for (const b of defaultWatchlists().filter((w) => w.builtin)) {
    if (!out.some((w) => w.builtin === b.builtin)) out.unshift(b)
  }
  // 組み込みは先頭（★お気に入り → ◆売買候補）
  return [
    ...out.filter((w) => w.builtin === 'favorites'),
    ...out.filter((w) => w.builtin === 'candidates'),
    ...out.filter((w) => !w.builtin),
  ]
}

/** 版ごとの移行（FR-S12）。版 0（版の無い素の値）→ 1 は中身をそのまま使う */
function migrate(_n: Name, version: number, data: unknown): unknown {
  let d = data
  if (version < 1) d = data
  return d
}
