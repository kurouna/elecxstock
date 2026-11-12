// 利用者のデータ（FR-S4, S12）: JSON に版を持ち、一時ファイルに書いてから置き換え、直近 10 世代を残す。
// 読み込み・検証に失敗したら、そのファイルを退避して知らせ、読み取り専用で起動する（空で上書きしない）。
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { screenSchema, settingsSchema, watchlistSchema } from '@shared/api'
import type { SavedScreen, Settings, Watchlist } from '@shared/types'
import { z } from 'zod'

export const STORE_VERSION = 1
const GENERATIONS = 10

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja',
  candleStyle: 'jp',
  density: 'normal',
  uiScale: 1,
  retentionYears: 5,
  disclaimerAccepted: false,
  firstRunDone: false,
  userInstruments: [],
  reduceMotion: false,
}

export function defaultWatchlists(): Watchlist[] {
  return [
    { id: 'favorites', builtin: 'favorites', name: { ja: '★お気に入り', en: '★ Favorites' }, items: [] },
    { id: 'candidates', builtin: 'candidates', name: { ja: '◆売買候補', en: '◆ Candidates' }, items: [] },
    { id: 'income', name: { ja: '高配当', en: 'High yield' }, items: [] },
    { id: 'watch', name: { ja: '監視', en: 'Watch' }, items: [] },
  ]
}

/** 既定のスクリーン（FR-SC15） */
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
      { field: 'income.yield', op: '>=', value: 3.5 },
      { field: 'liq.turnover20', op: '>=', value: 1e9 },
      { field: 'attr.market', op: 'in', value: ['P', 'R'] },
    ]),
    s('value', '割安（PBR 1 倍割れ）', 'Value (P/B < 1)', [
      { field: 'value.pbr', op: '<=', value: 1 },
      { field: 'value.per', op: '<=', value: 15 },
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
  ]
}

const FILES = {
  settings: { schema: settingsSchema, def: () => DEFAULT_SETTINGS },
  watchlists: { schema: z.array(watchlistSchema), def: defaultWatchlists },
  screens: { schema: z.array(screenSchema), def: () => defaultScreens() },
  layout: { schema: z.unknown(), def: () => null },
} as const
type Name = keyof typeof FILES

export class UserStore {
  readOnly = false
  error: string | undefined
  private cache = new Map<Name, unknown>()
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
        const raw = JSON.parse(readFileSync(p, 'utf8')) as { version?: number; data?: unknown }
        const data = migrate(n, raw.version ?? 0, raw.data ?? raw)
        const parsed = f.schema.safeParse(n === 'settings' ? { ...DEFAULT_SETTINGS, ...(data as object) } : data)
        if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
        value = parsed.data
      } catch (e) {
        // 壊れたファイルは退避し、読み取り専用で起動する（FR-S12）
        const q = join(this.dir, 'backups', `${n}.broken-${Date.now()}.json`)
        try {
          renameSync(p, q)
        } catch {
          /* ignore */
        }
        this.readOnly = true
        this.error = `${n}.json: ${(e as Error).message}`
      }
    }
    if (n === 'watchlists') value = ensureBuiltins(value as Watchlist[])
    this.cache.set(n, value)
    return value as never
  }
  save<N extends Name>(n: N, value: z.infer<(typeof FILES)[N]['schema']>): void {
    if (this.readOnly) throw Object.assign(new Error('read-only'), { code: 'read-only' })
    const parsed = FILES[n].schema.parse(value)
    const p = this.path(n)
    const body = JSON.stringify({ version: STORE_VERSION, data: parsed }, null, 1)
    if (existsSync(p) && readFileSync(p, 'utf8') === body) return
    // 世代を残す（直近 10）
    if (existsSync(p) && n !== 'layout') {
      const b = join(this.dir, 'backups', `${n}.${Date.now()}.json`)
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
  exportAll(): string {
    return JSON.stringify(
      {
        format: 'elecxstock.userdata',
        version: STORE_VERSION,
        exportedAt: new Date().toISOString(),
        settings: this.load('settings'),
        watchlists: this.load('watchlists'),
        screens: this.load('screens'),
      },
      null,
      1,
    )
  }
  importAll(json: string): { watchlists: number; screens: number } {
    const o = JSON.parse(json) as { format?: string; watchlists?: unknown; screens?: unknown; settings?: unknown }
    if (o.format !== 'elecxstock.userdata') throw new Error('not an elecxstock export')
    const wl = z.array(watchlistSchema).parse(o.watchlists ?? [])
    const sc = z.array(screenSchema).parse(o.screens ?? [])
    this.save('watchlists', ensureBuiltins(wl))
    this.save('screens', sc.length ? sc : defaultScreens())
    if (o.settings) this.save('settings', settingsSchema.parse({ ...this.load('settings'), ...(o.settings as object) }))
    return { watchlists: wl.length, screens: sc.length }
  }
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
