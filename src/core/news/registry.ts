// 登録表（docs/design-news.md §2）。同梱の resources/news/feeds.json をビルドで core.js に取り込む（asar の中。利用者が書き換えられない）。
// 差し替え（ELECXSTOCK_NEWS_FEEDS）はスタブのプロバイダのときだけ効く。
import { readFileSync } from 'node:fs'
import { feedSchema, NEWS_SCHEMA_VERSION, type NewsFeed } from '@shared/news/schema'
import bundled from '../../../resources/news/feeds.json'

/**
 * 登録表を検証して読む。知らない schemaVersion は全体を使わない（null）。合わない行・重なる ID・規約を確かめずに既定オンの行は
 * 捨てて残りを使い、ログに残す
 */
export function readRegistry(raw: unknown, log: (m: string) => void = () => {}): NewsFeed[] | null {
  const r = raw as { schemaVersion?: unknown; feeds?: unknown } | null
  if (!r || r.schemaVersion !== NEWS_SCHEMA_VERSION || !Array.isArray(r.feeds)) {
    log(`news registry: unknown schema ${String(r?.schemaVersion)}`)
    return null
  }
  const out: NewsFeed[] = []
  for (const row of r.feeds) {
    const p = feedSchema.safeParse(row)
    const id = (row as { id?: unknown })?.id
    if (!p.success) log(`news registry: drop ${String(id)}: ${p.error.issues[0]?.message}`)
    else if (out.some((f) => f.id === p.data.id)) log(`news registry: duplicate ${p.data.id}`)
    else if (p.data.defaultOnFor.length && !p.data.terms) log(`news registry: ${p.data.id} is on by default without checked terms`)
    else out.push(p.data)
  }
  return out
}

export function loadRegistry(env: Record<string, string | undefined>, log: (m: string) => void): NewsFeed[] | null {
  const file = env.ELECXSTOCK_PROVIDER === 'stub' ? env.ELECXSTOCK_NEWS_FEEDS : undefined
  if (!file) return readRegistry(bundled, log)
  try {
    return readRegistry(JSON.parse(readFileSync(file, 'utf8')), log)
  } catch (e) {
    log(`news registry: ${String(e)}`)
    return null
  }
}
