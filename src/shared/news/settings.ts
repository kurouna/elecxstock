// ニュースの設定の読み取りと判断（docs/design-news.md §3.1・§8.1）。Core と設定の画面が共有する純粋な関数。
import {
  DEFAULT_NEWS_SETTINGS,
  INTERVAL_MAX,
  INTERVAL_MIN,
  type NewsFeed,
  type NewsLang,
  type NewsSettings,
  newsSettingsSchema,
} from './schema'

/**
 * 間隔の欄の読み取り。空欄・0 は「起動時に 1 回」（0）。1〜4 は下限の 5 に丸める。上限 1440。
 * 数でないものは null（欄に誤りを出す）
 */
export function intervalFromInput(s: string): { value: number; clamped: boolean } | null {
  const t = s.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  if (t === '') return { value: 0, clamped: false }
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  if (n === 0) return { value: 0, clamped: false }
  if (n < INTERVAL_MIN) return { value: INTERVAL_MIN, clamped: true }
  if (n > INTERVAL_MAX) return { value: INTERVAL_MAX, clamped: true }
  return { value: n, clamped: false }
}

/** 答えたときに既定でオンにするフィード（どちらかの言語で既定オンのものすべて。言語を変えても答え直さずに済む） */
export function defaultOnIds(feeds: readonly NewsFeed[]): string[] {
  return feeds.filter((f) => f.defaultOnFor.length > 0).map((f) => f.id)
}

/** フィードがオンか: 利用者の選択 → 既定（表示言語で既定オン・かつ答えたときに既定オンだったもの） */
export function feedOn(f: NewsFeed, s: NewsSettings, lang: NewsLang): boolean {
  const o = s.feeds[f.id]
  if (o != null) return o
  return f.defaultOnFor.includes(lang) && s.acceptedDefaults.includes(f.id)
}

/** 設定の、この言語の一覧に出すフィード（listFor。省略はフィードの言語） */
export function listedFor(f: NewsFeed, lang: NewsLang): boolean {
  return (f.listFor ?? [f.lang]).includes(lang)
}

/** 後の版で既定オンになったが、まだ答えていないフィード（案内を出す。黙ってオンにしない） */
export function newDefaults(feeds: readonly NewsFeed[], s: NewsSettings, lang: NewsLang): string[] {
  if (s.enabled !== true) return []
  return feeds.filter((f) => f.defaultOnFor.includes(lang) && !s.acceptedDefaults.includes(f.id) && s.feeds[f.id] == null).map((f) => f.id)
}

/** 保存したファイルを既定値と浅くマージして読む（合わない項目は既定値） */
export function readNewsSettings(raw: unknown): NewsSettings {
  const out: NewsSettings = { ...DEFAULT_NEWS_SETTINGS }
  if (!raw || typeof raw !== 'object') return out
  const shape = newsSettingsSchema.shape
  for (const k of Object.keys(shape) as (keyof NewsSettings)[]) {
    const r = shape[k].safeParse((raw as Record<string, unknown>)[k])
    if (r.success) (out as unknown as Record<string, unknown>)[k] = r.data
  }
  return out
}

/** 設定の変更（部分）。feeds の null は「既定に戻す」。初めて取ると答えたら、そのときの既定オンを覚える */
export function applyNewsPatch(
  s: NewsSettings,
  p: { enabled?: boolean; interval?: number; feeds?: Record<string, boolean | null> },
  feeds: readonly NewsFeed[],
): NewsSettings {
  const next: NewsSettings = { ...s, feeds: { ...s.feeds } }
  if (p.enabled != null) {
    next.enabled = p.enabled
    if (p.enabled && s.enabled !== true && s.acceptedDefaults.length === 0) next.acceptedDefaults = defaultOnIds(feeds)
  }
  if (p.interval != null) next.interval = p.interval === 0 ? 0 : Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, Math.round(p.interval)))
  for (const [id, v] of Object.entries(p.feeds ?? {})) {
    if (!feeds.some((f) => f.id === id)) continue
    if (v == null) delete next.feeds[id]
    else next.feeds[id] = v
  }
  return next
}
