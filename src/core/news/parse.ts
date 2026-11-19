// フィードの読み取り（docs/design-news.md §4.4）。RSS 2.0・RDF・Atom を同じ関数で読む。
// 取得と読み取りは elecdex（src/main/feeds/parse.ts・entities.ts）を参考にした。
// エンティティはパーサーに展開させず（DOCTYPE で定義したものが指数的に膨らむ）、ここで XML の 5 つ・数値参照・よく使う HTML の名前だけを解く。
import { XMLParser } from 'fast-xml-parser'

export interface RawItem {
  title: string
  link: string | null
  /** 日付の文字（読むのは parseDate） */
  date: string | null
  summary?: string
}
export interface ParsedFeed {
  items: RawItem[]
  /** 配信元が示す間隔（分。参考として出すだけ） */
  ttl: number | null
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  yen: '¥',
}
function codePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ''
}
/** 参照を解く（知らない名前はそのまま） */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const hex = ref[1] === 'x' || ref[1] === 'X'
      return codePoint(Number.parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10))
    }
    return NAMED[ref.toLowerCase()] ?? whole
  })
}

const CDATA = '#cdata'
const TEXT = '#text'
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  textNodeName: TEXT,
  cdataPropName: CDATA,
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
})
type Node = Record<string, unknown>
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v)
const asArray = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

function cdataText(v: unknown): string {
  if (Array.isArray(v)) return v.map(cdataText).join('')
  if (isNode(v) && typeof v[TEXT] === 'string') return v[TEXT]
  return typeof v === 'string' ? v : ''
}
/** 要素の文字（CDATA の外は参照を解く。CDATA はそのまま） */
function rawText(v: unknown): string {
  if (typeof v === 'string') return decodeEntities(v)
  if (Array.isArray(v)) return v.map(rawText).join('')
  if (!isNode(v)) return ''
  let s = ''
  if (typeof v[TEXT] === 'string') s += decodeEntities(v[TEXT])
  if (v[CDATA] !== undefined) s += cdataText(v[CDATA])
  return s
}
/** 1 行の文字: タグ（script・style は中身ごと）を除き、参照をもう一度解き、空白を詰める */
function plain(v: unknown, max: number): string {
  const html = rawText(v)
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  const s = decodeEntities(html).replace(/\s+/g, ' ').trim()
  return s.length > max ? `${cut(s, max - 1).trimEnd()}…` : s
}
/** 先頭の n 文字（UTF-16 の単位）。サロゲートペア（絵文字など）の途中で切らない */
function cut(s: string, n: number): string {
  const c = s.charCodeAt(n - 1)
  return s.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n)
}
/** 文書がルートの要素（rss・rdf:RDF・feed）の閉じタグで終わっているか（後ろの空白・コメントは除く）。途中で切れた文書を見分ける */
function closed(xml: string): boolean {
  const tail = xml.slice(-4096).replace(/<!--[\s\S]*?-->/g, '')
  return /<\/(?:[\w.-]+:)?(?:rss|RDF|feed)\s*>\s*$/.test(tail)
}

/** <link> が指す URL（RSS は文字、Atom は href。Atom の self・enclosure は記事ではない） */
function hrefOf(link: unknown): string {
  if (!isNode(link)) return rawText(link)
  const rel = link['@rel']
  if (typeof rel === 'string' && rel !== 'alternate') return ''
  return typeof link['@href'] === 'string' ? decodeEntities(link['@href']) : rawText(link)
}
function linkOf(n: Node): string | null {
  for (const l of asArray(n.link)) {
    const s = hrefOf(l).trim()
    if (s) return s
  }
  const guid = n.guid
  if (guid !== undefined && !(isNode(guid) && guid['@isPermaLink'] === 'false')) return rawText(guid).trim() || null
  return null
}
const DATE_FIELDS = ['pubDate', 'published', 'updated', 'date', 'issued', 'modified'] as const
function dateOf(n: Node): string | null {
  for (const f of DATE_FIELDS) {
    const s = n[f] === undefined ? '' : rawText(n[f]).trim()
    if (s) return s
  }
  return null
}
const SUMMARY_FIELDS = ['description', 'summary', 'encoded', 'content'] as const
function summaryOf(n: Node): string | undefined {
  for (const f of SUMMARY_FIELDS) {
    if (n[f] === undefined) continue
    const s = plain(n[f], 400)
    if (s) return s
  }
  return undefined
}

/** フィードの文書を読む。XML でない・フィードでないときは投げる */
export function parseFeed(xml: string): ParsedFeed {
  const doc = parser.parse(xml) as unknown
  const root = isNode(doc) ? [doc.rss, doc.RDF, doc.feed].find(isNode) : undefined
  if (!root) throw new Error('not a feed')
  // 寛容な読み取りは途中で切れた文書も読めてしまう（見出しが 0 件になり、前の見出しを空で上書きする）
  if (!closed(xml)) throw new Error('truncated feed')
  const channel = isNode(root.channel) ? root.channel : root
  const nodes = [root.item, root.entry, channel === root ? undefined : channel.item].flatMap(asArray).filter(isNode)
  const items: RawItem[] = []
  for (const n of nodes) {
    const title = plain(n.title, 300)
    if (!title) continue
    const summary = summaryOf(n)
    items.push({ title, link: linkOf(n), date: dateOf(n), ...(summary ? { summary } : {}) })
  }
  const ttl = Number.parseInt(rawText(channel.ttl), 10)
  return { items, ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : null }
}

/** 時刻帯の略号（JST など。Date.parse に任せない） */
const ZONES: Record<string, string> = {
  JST: '+0900',
  KST: '+0900',
  HKT: '+0800',
  SGT: '+0800',
  CST: '-0600',
  CDT: '-0500',
  EST: '-0500',
  EDT: '-0400',
  MST: '-0700',
  MDT: '-0600',
  PST: '-0800',
  PDT: '-0700',
  GMT: '+0000',
  UTC: '+0000',
  UT: '+0000',
  Z: '+0000',
  BST: '+0100',
  CET: '+0100',
  CEST: '+0200',
}
/**
 * 日付を読む。時刻帯の無いものは zone（'+09:00' など）で読む（PC の時刻帯に依らない）。日付だけはその日の 0 時で dateOnly。
 * 読めないものは null
 */
export function parseDate(raw: string, zone: string): { at: number; dateOnly: boolean } | null {
  const s = raw.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) {
    const at = Date.parse(`${s}T00:00:00${zone}`)
    return Number.isFinite(at) ? { at, dateOnly: true } : null
  }
  m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s)
  if (m) {
    const z = m[3] ? (m[3].toUpperCase() === 'Z' ? 'Z' : m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')) : zone
    const at = Date.parse(`${m[1]}T${m[2]}${z}`)
    return Number.isFinite(at) ? { at, dateOnly: false } : null
  }
  // RFC 822 の形で時刻の無いもの（Tue, 17 Nov 2026）: その日の 0 時（フィードの時刻帯）で日付だけ
  if (/^([a-z]{3},\s*)?\d{1,2}\s+[a-z]{3}\s+\d{4}$/i.test(s)) {
    const at = Date.parse(`${s} 00:00:00 ${zone.replace(':', '')}`)
    return Number.isFinite(at) ? { at, dateOnly: true } : null
  }
  // RFC 822 の形（曜日・月の名前）。末尾の略号を置き換え、時刻帯が無ければ zone を足す
  let r = s.replace(/\s+([A-Z]{1,4})$/i, (w, a: string) => {
    const off = ZONES[a.toUpperCase()]
    return off ? ` ${off}` : w
  })
  if (!/[+-]\d{4}$/.test(r) && /\d{1,2}:\d{2}(:\d{2})?$/.test(r)) r = `${r} ${zone.replace(':', '')}`
  if (!/[a-z]{3}/i.test(r) || !/\d{4}/.test(r)) return null
  const at = Date.parse(r)
  return Number.isFinite(at) ? { at, dateOnly: false } : null
}

/** 本文の文字コード: Content-Type の charset → XML 宣言 → UTF-8 */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const fromType = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType ?? '')?.[1]
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200))
  const fromDecl = /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1]
  for (const label of [fromType, fromDecl, 'utf-8']) {
    if (!label) continue
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      /* 知らない文字コードは次へ */
    }
  }
  return new TextDecoder().decode(bytes)
}
