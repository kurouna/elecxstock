// 楽天証券の「保有商品一覧（すべて）」CSV（assetbalance(all)_*.csv）を読む（FR-H11）。純粋関数。
// 文字コードの変換（Shift_JIS → UTF-16）は renderer が済ませ、ここには文字列で渡す。
// 取り込むのは「国内株式」の行だけ。投資信託・米国株式などは対象外として数える（§1.2）。
import type { AccountType, Holding } from '@shared/types'

/** 口座の表記 → 口座区分。旧つみたて NISA は旧 NISA にまとめる */
const ACCOUNTS: Record<string, AccountType> = {
  特定: 'tokutei',
  一般: 'ippan',
  NISA成長投資枠: 'nisa_growth',
  NISAつみたて投資枠: 'nisa_tsumitate',
  旧NISA: 'nisa_legacy',
  旧つみたてNISA: 'nisa_legacy',
  つみたてNISA: 'nisa_legacy',
}

export interface RakutenParsed {
  holdings: Holding[]
  /** 取り込まない行（国内株式以外・読めない行） */
  skipped: { kind: string; name: string; reason: 'out-of-scope' | 'invalid' | 'unknown-account' }[]
  /** 資産合計欄の「国内株式」の行（実現損益・配当金の累計。CSV にあれば） */
  summary: { realized: number | null; dividends: number | null } | null
}

/** 1 行を欄に分ける（"" で囲まれた欄、"" のエスケープ、囲みの中のカンマ） */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** "1,807.76" "+13.0" "-" → 数。読めなければ null */
export function num(s: string | undefined): number | null {
  if (s == null) return null
  const t = s.replace(/[,\s]/g, '').replace(/^\+/, '')
  if (!t || t === '-') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** 全角の英数字を半角にする（銘柄名は「ＮＴＴ」のように全角で来る） */
const half = (s: string) => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ')

export function isRakutenCsv(text: string): boolean {
  return /"?種別"?,"?銘柄コード・ティッカー"?/.test(text)
}

export function parseRakutenCsv(text: string, importedAt = new Date().toISOString()): RakutenParsed {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const hi = lines.findIndex((l) => /^"?種別"?,"?銘柄コード・ティッカー"?/.test(l))
  if (hi < 0) throw Object.assign(new Error('not a Rakuten Securities holdings CSV'), { code: 'invalid-params' })
  const head = splitCsvLine(lines[hi] ?? '')
  const col = (name: string) => head.findIndex((h) => h.trim() === name)
  const C = {
    kind: col('種別'),
    code: col('銘柄コード・ティッカー'),
    name: col('銘柄'),
    account: col('口座'),
    qty: col('保有数量'),
    avg: col('平均取得価額'),
    price: col('現在値'),
  }
  if (Object.values(C).some((i) => i < 0)) throw Object.assign(new Error('missing columns in Rakuten CSV'), { code: 'invalid-params' })

  // 資産合計欄の「国内株式」の行: 見出しの行から実現損益・配当金の欄を探す
  let summary: RakutenParsed['summary'] = null
  const sh = lines.findIndex((l, i) => i < hi && l.includes('実現損益'))
  if (sh >= 0) {
    const h = splitCsvLine(lines[sh] ?? '')
    const ri = h.findIndex((x) => x.startsWith('実現損益'))
    const di = h.findIndex((x) => x.startsWith('配当金') && x.includes('円'))
    const row = lines
      .slice(sh, hi)
      .map(splitCsvLine)
      .find((c) => c[0] === '国内株式')
    if (row) summary = { realized: ri >= 0 ? num(row[ri]) : null, dividends: di >= 0 ? num(row[di]) : null }
  }

  const holdings: Holding[] = []
  const skipped: RakutenParsed['skipped'] = []
  for (const line of lines.slice(hi + 1)) {
    if (!line.trim()) break // 表の終わり（空行の後は参考為替レート）
    const c = splitCsvLine(line)
    const kind = c[C.kind] ?? ''
    const name = half(c[C.name] ?? '').trim()
    if (kind !== '国内株式') {
      skipped.push({ kind, name, reason: 'out-of-scope' })
      continue
    }
    const code = half(c[C.code] ?? '')
      .trim()
      .toUpperCase()
    const account = ACCOUNTS[(c[C.account] ?? '').replace(/\s/g, '')]
    const quantity = num(c[C.qty])
    const avgCost = num(c[C.avg])
    if (!account) {
      skipped.push({ kind, name, reason: 'unknown-account' })
      continue
    }
    if (!/^[0-9][0-9A-Z]{3}$/.test(code) || quantity == null || quantity <= 0 || avgCost == null || avgCost < 0) {
      skipped.push({ kind, name, reason: 'invalid' })
      continue
    }
    const price = num(c[C.price])
    holdings.push({ code, account, quantity, avgCost, name, ...(price != null ? { price } : {}), broker: 'rakuten', importedAt })
  }
  return { holdings, skipped, summary }
}
