// JPX の上場銘柄一覧（data_j.xlsx / data_e.xlsx）の読み込み（FR-U1, U2, U5, U7）。
// xlsx は zip の中の XML なので、fflate で展開して必要な 2 つの XML だけを読む（依存を増やさない）。

import type { InstrumentKind, Market } from '@shared/types'
import { strFromU8, unzipSync } from 'fflate'
import type { UniverseRow } from './types'

export const JPX_URL_JA = 'https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx'
export const JPX_URL_EN = 'https://www.jpx.co.jp/english/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_e.xlsx'

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** xlsx の最初のシートを文字列の 2 次元配列にする */
export function readXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet1\.xml$/.test(f.name) })
  const ss: string[] = []
  const ssXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : ''
  for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...si[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!))
    ss.push(parts.join(''))
  }
  const sheet = files['xl/worksheets/sheet1.xml']
  if (!sheet) throw new Error('sheet1 not found')
  const xml = strFromU8(sheet)
  const rows: string[][] = []
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const out: string[] = []
    for (const c of row[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1] ?? ''
      const t = attrs.match(/t="(\w+)"/)?.[1]
      const inner = c[2] ?? ''
      let v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (t === 's' && v != null) v = ss[Number(v)] ?? ''
      else if (t === 'inlineStr') v = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join('')
      else if (v != null) v = decode(v)
      out[colIndex(ref)] = v ?? ''
    }
    rows.push(Array.from(out, (x) => x ?? ''))
  }
  return rows
}

/** 市場・商品区分から市場と種類を決める。J-REIT は「投資法人」を含み「インフラ」を含まないもの（decisions.md §5） */
export function classify(code: string, name: string, section: string): { market: Market; kind: InstrumentKind } {
  const n = name.normalize('NFKC')
  const pref = code.length === 5
  if (section.startsWith('プライム（内国')) return { market: 'P', kind: pref ? 'pref' : 'stock' }
  if (section.startsWith('スタンダード（内国')) return { market: 'S', kind: pref ? 'pref' : 'stock' }
  if (section.startsWith('グロース（内国')) return { market: 'G', kind: pref ? 'pref' : 'stock' }
  if (section.startsWith('ETF')) return { market: 'E', kind: 'etf' }
  if (section.startsWith('REIT')) {
    if (n.includes('投資法人') && !n.includes('インフラ')) return { market: 'R', kind: 'reit' }
    return { market: 'X', kind: 'other' }
  }
  return { market: 'X', kind: 'other' }
}

export function parseJpx(ja: Uint8Array, en?: Uint8Array): UniverseRow[] {
  const rowsJa = readXlsx(ja)
  const enByCode = new Map<string, { name: string; sector: string }>()
  if (en) {
    for (const r of readXlsx(en).slice(1))
      if (r[1]) enByCode.set(String(r[1]).trim(), { name: String(r[2] ?? ''), sector: String(r[5] ?? '') })
  }
  const out: UniverseRow[] = []
  for (const r of rowsJa.slice(1)) {
    const code = String(r[1] ?? '').trim()
    if (!/^[0-9][0-9A-Z]{3,4}$/.test(code)) continue
    const nameJa = String(r[2] ?? '')
      .normalize('NFKC')
      .trim()
    const { market, kind } = classify(code, nameJa, String(r[3] ?? ''))
    const e = enByCode.get(code)
    const sec = String(r[5] ?? '')
    out.push({
      code,
      nameJa,
      nameEn: e?.name?.trim() || '',
      market,
      kind,
      sectorJa: sec === '-' ? '' : sec,
      sectorEn: e?.sector && e.sector !== '-' ? e.sector : '',
    })
  }
  return out
}
