// 記事のリンク（docs/design-news.md §4.4・§9）。Core は見出しのリンクを整え、main は開く前に確かめる。

/** 見出しのリンクを整える: http は https に上げ、ホストがフィードの linkHosts に完全一致するものだけ残す。utm_* を外す */
export function normalizeLink(href: string | null | undefined, linkHosts: readonly string[]): string | undefined {
  if (!href || href.length > 2048) return undefined
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return undefined
  }
  if (u.protocol === 'http:') u.protocol = 'https:'
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return undefined
  if (!linkHosts.includes(u.hostname)) return undefined
  for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k)
  u.hash = ''
  return u.href.length > 2048 ? undefined : u.href
}

/** main が開いてよい記事のリンクか: https・ホストが（全フィードの）linkHosts に完全一致 */
export function isNewsLink(url: unknown, hosts: ReadonlySet<string>): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.has(u.hostname)
  } catch {
    return false
  }
}
