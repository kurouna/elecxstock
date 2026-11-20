// テスト・スクリーンショット用のスタブ（ELECXSTOCK_PROVIDER=stub）。外部に一切接続しない（§11）。
// 銘柄名・コードは実在だが、値はすべて架空（実際のデータは使わない。権利関係のため）: 株価・出来高・配当は乱数で作り、
// 基準の株価・利回り・権利月・分割の日付と比率も乱数で決めた、実際とは無関係な値。
import type { Dividend, InstrumentKind, Market, Split } from '@shared/types'
import { addDays, isTradingDay, jstNow, lastClosedSession } from '../calendar'
import type { HistoryResult, Provider, ProviderQuote, RawBar, UniverseRow } from './types'

type Seed = [
  code: string,
  ja: string,
  en: string,
  market: Market,
  kind: InstrumentKind,
  sector: string,
  sectorEn: string,
  base: number,
  yld: number,
  months: number[],
]
const U: Seed[] = [
  ['7203', 'トヨタ自動車', 'TOYOTA MOTOR CORPORATION', 'P', 'stock', '輸送用機器', 'Transportation Equipment', 18616, 2.7, [3, 9]],
  ['8058', '三菱商事', 'MITSUBISHI CORPORATION', 'P', 'stock', '卸売業', 'Wholesale Trade', 12872, 4.9, [3, 9]],
  ['8306', '三菱UFJフィナンシャル・グループ', 'Mitsubishi UFJ Financial Group,Inc.', 'P', 'stock', '銀行業', 'Banks', 19707, 2.2, [3, 9]],
  ['8316', '三井住友フィナンシャルグループ', 'Sumitomo Mitsui Financial Group,Inc.', 'P', 'stock', '銀行業', 'Banks', 4728, 4.5, [2, 8]],
  ['8411', 'みずほフィナンシャルグループ', 'Mizuho Financial Group,Inc.', 'P', 'stock', '銀行業', 'Banks', 704, 3.3, [4, 10]],
  ['9432', '日本電信電話', 'NTT,Inc.', 'P', 'stock', '情報・通信業', 'Information & Communication', 4746, 3.2, [2, 8]],
  ['9433', 'KDDI', 'KDDI CORPORATION', 'P', 'stock', '情報・通信業', 'Information & Communication', 5312, 3.5, [5, 11]],
  ['9434', 'ソフトバンク', 'SoftBank Corp.', 'P', 'stock', '情報・通信業', 'Information & Communication', 2221, 4.2, [3, 9]],
  ['2914', '日本たばこ産業', 'JAPAN TOBACCO INC.', 'P', 'stock', '食料品', 'Foods', 16821, 2.0, [2, 8]],
  ['8001', '伊藤忠商事', 'ITOCHU Corporation', 'P', 'stock', '卸売業', 'Wholesale Trade', 3895, 4.0, [5, 11]],
  ['8031', '三井物産', 'MITSUI & CO.,LTD.', 'P', 'stock', '卸売業', 'Wholesale Trade', 14268, 4.1, [6, 12]],
  ['8053', '住友商事', 'SUMITOMO CORPORATION', 'P', 'stock', '卸売業', 'Wholesale Trade', 7125, 3.9, [3, 9]],
  // 卸売業を 5 銘柄にして、銘柄情報の業種の中央値（5 銘柄から）をスタブでも出す。値は架空
  ['8002', '丸紅', 'Marubeni Corporation', 'P', 'stock', '卸売業', 'Wholesale Trade', 2650, 3.6, [3, 9]],
  ['4502', '武田薬品工業', 'Takeda Pharmaceutical Company Limited', 'P', 'stock', '医薬品', 'Pharmaceutical', 18279, 2.5, [2, 8]],
  ['8766', '東京海上ホールディングス', 'Tokio Marine Holdings,Inc.', 'P', 'stock', '保険業', 'Insurance', 7755, 1.3, [3, 9]],
  ['5401', '日本製鉄', 'NIPPON STEEL CORPORATION', 'P', 'stock', '鉄鋼', 'Iron & Steel', 8416, 2.9, [3, 9]],
  ['1605', 'INPEX', 'INPEX CORPORATION', 'P', 'stock', '鉱業', 'Mining', 476, 2.3, [5, 11]],
  ['6501', '日立製作所', 'Hitachi,Ltd.', 'P', 'stock', '電気機器', 'Electric Appliances', 12860, 4.4, [3, 9]],
  ['6758', 'ソニーグループ', 'Sony Group Corporation', 'P', 'stock', '電気機器', 'Electric Appliances', 6028, 2.5, [1, 7]],
  ['7974', '任天堂', 'Nintendo Co.,Ltd.', 'P', 'stock', 'その他製品', 'Other Products', 10754, 1.9, [3, 9]],
  ['4063', '信越化学工業', 'Shin-Etsu Chemical Co.,Ltd.', 'P', 'stock', '化学', 'Chemicals', 973, 4.1, [3, 9]],
  ['8591', 'オリックス', 'ORIX CORPORATION', 'P', 'stock', 'その他金融業', 'Other Financing Business', 14009, 3.7, [1, 7]],
  ['5020', 'ENEOSホールディングス', 'ENEOS Holdings,Inc.', 'P', 'stock', '石油・石炭製品', 'Oil & Coal Products', 3984, 3.6, [6, 12]],
  // 株価ボード・ヒートマップ・ランキングの見本を厚くするための銘柄（全体で 50 銘柄）。基準の株価・利回り・権利月は実際と無関係な架空の値
  ['8035', '東京エレクトロン', 'Tokyo Electron Limited', 'P', 'stock', '電気機器', 'Electric Appliances', 5210, 1.6, [3, 9]],
  ['6861', 'キーエンス', 'KEYENCE CORPORATION', 'P', 'stock', '電気機器', 'Electric Appliances', 3480, 1.1, [3, 9]],
  ['9983', 'ファーストリテイリング', 'FAST RETAILING CO.,LTD.', 'P', 'stock', '小売業', 'Retail Trade', 9150, 1.4, [2, 8]],
  ['6098', 'リクルートホールディングス', 'Recruit Holdings Co.,Ltd.', 'P', 'stock', 'サービス業', 'Services', 2870, 1.2, [3, 9]],
  ['7267', '本田技研工業', 'HONDA MOTOR CO.,LTD.', 'P', 'stock', '輸送用機器', 'Transportation Equipment', 1640, 4.3, [3, 9]],
  ['6902', 'デンソー', 'DENSO CORPORATION', 'P', 'stock', '輸送用機器', 'Transportation Equipment', 7720, 2.8, [3, 9]],
  ['6367', 'ダイキン工業', 'DAIKIN INDUSTRIES,LTD.', 'P', 'stock', '機械', 'Machinery', 4380, 1.9, [3, 9]],
  ['6301', '小松製作所', 'KOMATSU LTD.', 'P', 'stock', '機械', 'Machinery', 6120, 3.7, [3, 9]],
  ['9020', '東日本旅客鉄道', 'East Japan Railway Company', 'P', 'stock', '陸運業', 'Land Transportation', 2350, 2.2, [3, 9]],
  ['9101', '日本郵船', 'NIPPON YUSEN KABUSHIKI KAISHA', 'P', 'stock', '海運業', 'Marine Transportation', 8840, 4.8, [3, 9]],
  ['8801', '三井不動産', 'Mitsui Fudosan Co.,Ltd.', 'P', 'stock', '不動産業', 'Real Estate', 1930, 2.6, [3, 9]],
  ['4519', '中外製薬', 'CHUGAI PHARMACEUTICAL CO.,LTD.', 'P', 'stock', '医薬品', 'Pharmaceutical', 6650, 2.0, [6, 12]],
  [
    '94345',
    'ソフトバンク第1回社債型種類株式',
    'SoftBank Corp. Bond-type Class Shares 1',
    'P',
    'pref',
    '情報・通信業',
    'Information & Communication',
    4442,
    2.8,
    [2, 8],
  ],
  ['130A', 'Veritas In Silico', 'Veritas In Silico Inc.', 'G', 'stock', '医薬品', 'Pharmaceutical', 927, 0, []],
  ['8951', '日本ビルファンド投資法人', 'Nippon Building Fund Inc.', 'R', 'reit', '', '', 105000, 5.7, [4, 10]],
  ['8952', 'ジャパンリアルエステイト投資法人', 'Japan Real Estate Investment Corporation', 'R', 'reit', '', '', 52000, 5.4, [5, 11]],
  ['3462', '野村不動産マスターファンド投資法人', 'Nomura Real Estate Master Fund,Inc.', 'R', 'reit', '', '', 109000, 4.1, [1, 7]],
  ['3283', '日本プロロジスリート投資法人', 'Nippon Prologis REIT,Inc.', 'R', 'reit', '', '', 109000, 4.3, [5, 11]],
  ['8953', '日本都市ファンド投資法人', 'Japan Metropolitan Fund Investment Corporation', 'R', 'reit', '', '', 54000, 5.8, [5, 11]],
  ['3269', 'アドバンス・レジデンス投資法人', 'Advance Residence Investment Corporation', 'R', 'reit', '', '', 58000, 4.6, [3, 9]],
  ['8963', 'インヴィンシブル投資法人', 'Invincible Investment Corporation', 'R', 'reit', '', '', 150000, 4.3, [3, 9]],
  ['3281', 'GLP投資法人', 'GLP J-REIT', 'R', 'reit', '', '', 148000, 5.4, [5, 11]],
  ['1306', 'NEXT FUNDS TOPIX連動型上場投信', 'NEXT FUNDS TOPIX Exchange Traded Fund', 'E', 'etf', '', '', 3107, 2.6, [3]],
  // マーケットのペインの既定（東証 REIT 指数の ETF）。値は架空
  ['1343', 'NEXT FUNDS 東証REIT指数連動型上場投信', 'NEXT FUNDS REIT INDEX ETF', 'E', 'etf', '', '', 2010, 3.9, [2, 5, 8, 11]],
  // マーケット一覧の連動 ETF（FR-U6）。値は架空
  [
    '1591',
    'NEXT FUNDS JPX日経インデックス400連動型上場投信',
    'NEXT FUNDS JPX-Nikkei Index 400 Exchange Traded Fund',
    'E',
    'etf',
    '',
    '',
    28150,
    1.9,
    [7],
  ],
  ['2516', '東証グロース250ETF', 'TSE Growth 250 ETF', 'E', 'etf', '', '', 640, 0, []],
  [
    '9282',
    'いちごグリーンインフラ投資法人',
    'Ichigo Green Infrastructure Investment Corporation',
    'X',
    'other',
    '',
    '',
    89000,
    4.9,
    [5, 11],
  ],
]
const BY = new Map(U.map((s) => [s[0], s]))
/**
 * 境界を試すための架空の設定（テスト計画 §3.1。実際とは無関係）:
 * 8002 は 2024 年を最後に無配に転じた、1605 は 2026-03-02 に上場した（日足が 1 年に満たない）ことにする
 */
const EDGE: Record<string, { divUntil?: number; listed?: string }> = {
  '8002': { divUntil: 2024 },
  '1605': { listed: '2026-03-02' },
}

function rng(seed: string) {
  let a = 0
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cache = new Map<string, { bars: RawBar[]; dividends: Dividend[]; splits: Split[] }>()
const dayCache = new Map<string, string[]>()
/**
 * 2000-01-04 から end までの東証の営業日。全銘柄（と指数）で同じなので末日ごとに 1 回だけ作る
 * （銘柄ごとに 26 年分の日付を作り直すと、初回の一括気配で Core が数秒止まり、終了の頼みに応えられない）
 */
function tradingDaysTo(end: string): string[] {
  const hit = dayCache.get(end)
  if (hit) return hit
  const a: string[] = []
  for (let d = '2000-01-04'; d <= end; d = addDays(d, 1)) if (isTradingDay(d)) a.push(d)
  dayCache.set(end, a)
  return a
}
const weekCache = new Map<string, string[]>()
/** 2000-01-03 から end までの平日（daily なら毎日）。海外の行で共有する */
function extDaysTo(end: string, daily: boolean): string[] {
  const key = `${end}@${daily}`
  const hit = weekCache.get(key)
  if (hit) return hit
  const a: string[] = []
  for (let d = '2000-01-03'; d <= end; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (daily || (wd !== 0 && wd !== 6)) a.push(d)
  }
  weekCache.set(key, a)
  return a
}
/** 系列は末日（直近の取引日）ごとに作る（テストで時刻を進めると、その日までの系列になる） */
function series(code: string) {
  const key = `${code}@${lastClosedSession()}`
  const hit = cache.get(key)
  if (hit) return hit
  const s = BY.get(code)
  if (!s) throw new Error('no data')
  const [, , , , kind, , , base, yld, months] = s
  const r = rng(code)
  const end = lastClosedSession()
  const edge = EDGE[code] ?? {}
  const all = tradingDaysTo(end)
  const days = edge.listed ? all.filter((d) => d >= edge.listed!) : all
  const vol = kind === 'reit' ? 0.009 : kind === 'etf' || kind === 'pref' ? 0.006 : 0.016
  const drift = (r() - 0.42) * 0.0005
  const closes: number[] = new Array(days.length)
  closes[days.length - 1] = base
  for (let i = days.length - 2; i >= 0; i--) closes[i] = closes[i + 1]! / (1 + drift + (r() - 0.5) * 2 * vol + Math.sin(i / 41) * 0.002)
  const tick = base >= 10000 ? 100 : base >= 1000 ? 1 : 0.1
  const rd = (x: number) => Math.round(x / tick) * tick
  const vbase = kind === 'reit' ? 12000 : kind === 'etf' ? 900000 : (2e10 / base) * (0.3 + r())
  const bars: RawBar[] = days.map((d, i) => {
    const c = closes[i]!
    const o = i ? closes[i - 1]! * (1 + (r() - 0.5) * vol * 0.6) : c
    return {
      d,
      o: rd(o),
      h: rd(Math.max(o, c) * (1 + r() * vol * 0.8)),
      l: rd(Math.min(o, c) * (1 - r() * vol * 0.8)),
      c: rd(c),
      v: Math.round(vbase * (0.5 + r() * 1.2)),
    }
  })
  const dividends: Dividend[] = []
  if (months.length) {
    for (let y = 2001; y <= Number(end.slice(0, 4)); y++) {
      for (const m of months) {
        let d = `${y}-${String(m).padStart(2, '0')}-27`
        while (!isTradingDay(d)) d = addDays(d, 1)
        if (d > end || d < days[0]! || (edge.divUntil != null && y > edge.divUntil)) continue
        const g = (kind === 'reit' ? 1.02 : 1.06) ** (y - Number(end.slice(0, 4)))
        const per = ((base * yld) / 100 / months.length) * g * (0.97 + r() * 0.06)
        dividends.push({ date: d, amount: base >= 10000 ? Math.round(per) : Math.round(per * 10) / 10 })
      }
    }
  }
  // 分割の検知・調整を試すための架空の分割（日付・比率は実際とは無関係）
  const splits: Split[] = code === '7203' ? [{ date: '2024-04-26', ratio: 3 }] : code === '9434' ? [{ date: '2024-06-26', ratio: 4 }] : []
  const out = { bars, dividends, splits }
  cache.set(key, out)
  return out
}

/**
 * マーケット一覧の海外の行（FR-MB1）の架空の系列。記号は実在、水準・値動きは実際と無関係。
 * 東証の休日にも動く（平日はすべて取引日。暗号資産は毎日）ので、東証の営業日で判断しないこと（FR-MB3）を試せる
 */
const EXT: Record<string, { base: number; vol: number; digits: number; volume: boolean; daily?: boolean }> = {
  'NIY=F': { base: 41000, vol: 0.013, digits: 0, volume: true },
  '^DJI': { base: 40000, vol: 0.01, digits: 2, volume: true },
  '^GSPC': { base: 5500, vol: 0.01, digits: 2, volume: true },
  '^IXIC': { base: 17000, vol: 0.013, digits: 2, volume: true },
  '^SOX': { base: 5000, vol: 0.02, digits: 2, volume: false },
  '^VIX': { base: 18, vol: 0.05, digits: 2, volume: false },
  '^HSI': { base: 21000, vol: 0.013, digits: 2, volume: true },
  '000001.SS': { base: 3200, vol: 0.01, digits: 2, volume: true },
  'JPY=X': { base: 148.5, vol: 0.004, digits: 3, volume: false },
  'EURJPY=X': { base: 161.2, vol: 0.004, digits: 3, volume: false },
  '^TNX': { base: 4.15, vol: 0.015, digits: 3, volume: false },
  'CL=F': { base: 72, vol: 0.02, digits: 2, volume: true },
  'GC=F': { base: 2400, vol: 0.009, digits: 1, volume: true },
  'SI=F': { base: 29.5, vol: 0.016, digits: 3, volume: true },
  'BTC-JPY': { base: 9_800_000, vol: 0.03, digits: 0, volume: true, daily: true },
}
const extCache = new Map<string, RawBar[]>()
function ext(symbol: string): RawBar[] {
  const key = `${symbol}@${lastClosedSession()}`
  const hit = extCache.get(key)
  if (hit) return hit
  const e = EXT[symbol]!
  const r = rng(symbol)
  const end = lastClosedSession()
  const days = extDaysTo(end, !!e.daily)
  const f = 10 ** e.digits
  const rd = (x: number) => Math.round(x * f) / f
  // 最新の値は基準の ±10%（きりのよい数にしない）
  let c = e.base * (0.9 + r() * 0.2)
  const arr: RawBar[] = []
  for (let i = days.length - 1; i >= 0; i--) {
    const o = c * (1 + (r() - 0.5) * e.vol * 0.5)
    arr.push({
      d: days[i]!,
      o: rd(o),
      h: rd(Math.max(o, c) * (1 + r() * e.vol * 0.4)),
      l: rd(Math.min(o, c) * (1 - r() * e.vol * 0.4)),
      c: rd(c),
      v: e.volume ? Math.round(1e5 * (0.5 + r())) : 0,
    })
    c = c / (1 + (r() - 0.49) * e.vol * 2)
  }
  const bars = arr.reverse()
  extCache.set(key, bars)
  return bars
}

export function createStubProvider(): Provider {
  return {
    id: 'stub',
    priceBasis: 'split-adjusted',
    quoteBatchSize: 50,
    minIntervalMs: 0,
    jitterMs: 0,
    toSymbol: (code, kind) => (kind === 'index' ? `^${code}` : `${code}.T`),
    async fetchHistory(symbol, { from, interval }): Promise<HistoryResult> {
      if (EXT[symbol]) {
        const bars = ext(symbol).filter((b) => b.d >= from)
        return { bars: interval === '1mo' ? monthly(bars) : bars, dividends: [], splits: [] }
      }
      const code = symbol.replace(/\.T$/, '').replace(/^\^/, '')
      if (code === 'N225') return idx(from, interval)
      const s = series(code)
      const bars = s.bars.filter((b) => b.d >= from)
      if (interval === '1mo') return { bars: monthly(bars), dividends: s.dividends.filter((d) => d.date >= from), splits: [] }
      return { bars, dividends: s.dividends.filter((d) => d.date >= from), splits: s.splits.filter((x) => x.date >= from) }
    },
    async fetchQuotes(symbols): Promise<ProviderQuote[]> {
      const { minutes } = jstNow()
      return symbols.flatMap((sym): ProviderQuote[] => {
        if (EXT[sym]) {
          const b = ext(sym)
          const last = b.at(-1)!
          return [
            {
              symbol: sym,
              time: Date.parse(`${last.d}T06:30:00Z`),
              price: last.c,
              open: last.o,
              high: last.h,
              low: last.l,
              volume: last.v,
              prevClose: b.at(-2)!.c,
              per: null,
              pbr: null,
              marketCap: null,
              shares: null,
              bps: null,
              eps: null,
              nameEn: null,
            },
          ]
        }
        const code = sym.replace(/\.T$/, '').replace(/^\^/, '')
        const s = BY.get(code)
        if (!s && code !== 'N225') return []
        const b = code === 'N225' ? idx('2000-01-01', '1d').bars : series(code).bars
        const last = b.at(-1)!
        const prev = b.at(-2)!
        const r = rng(`${code}q`)
        const base = s?.[7] ?? last.c
        return [
          {
            symbol: sym,
            time: Date.parse(`${last.d}T06:30:00Z`) + (minutes >= 0 ? 0 : 0),
            price: last.c,
            open: last.o,
            high: last.h,
            low: last.l,
            volume: last.v,
            prevClose: prev.c,
            per: s && s[4] !== 'etf' && code !== '130A' ? 8 + r() * 22 : null,
            pbr: s && s[4] !== 'etf' ? 0.6 + r() * 2.4 : null,
            marketCap: s ? base * (s[4] === 'reit' ? 3e6 + r() * 6e6 : (5e12 / base) * (0.3 + r() * 1.5)) : null,
            shares: null,
            bps: null,
            eps: null,
            nameEn: s?.[2] ?? 'Nikkei 225',
            // 決算発表（架空）: 株式は最新の足の 40〜100 日後を推定の予定、45〜90 日前を前回にする。REIT・ETF は無し
            ...(s && s[4] === 'stock'
              ? {
                  earningsNext: Date.parse(`${last.d}T06:00:00Z`) + Math.floor(40 + r() * 60) * 86400000,
                  earningsLast: Date.parse(`${last.d}T06:00:00Z`) - Math.floor(45 + r() * 45) * 86400000,
                  earningsEst: true,
                }
              : {}),
          },
        ]
      })
    },
    async fetchUniverse(): Promise<UniverseRow[]> {
      return U.map(([code, nameJa, nameEn, market, kind, sectorJa, sectorEn]) => ({
        code,
        nameJa,
        nameEn,
        market,
        kind,
        sectorJa,
        sectorEn,
      }))
    },
  }
}

function monthly(bars: RawBar[]): RawBar[] {
  const out: RawBar[] = []
  for (const b of bars) {
    const m = `${b.d.slice(0, 7)}-01`
    const cur = out.at(-1)
    if (!cur || cur.d !== m) out.push({ ...b, d: m })
    else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
    }
  }
  return out
}
/** 指数の足（取引の終わった最新の日ごと。株の足の cache と同じく、時刻が進めば作り直す） */
const idxCache: { end?: string; bars?: RawBar[] } = {}
function idx(from: string, interval: '1d' | '1mo'): HistoryResult {
  const end = lastClosedSession()
  if (!idxCache.bars || idxCache.end !== end) {
    const r = rng('N225')
    const days = tradingDaysTo(end)
    let c = 38000 // 架空の水準
    const arr: RawBar[] = []
    for (let i = days.length - 1; i >= 0; i--) {
      const o = c * (1 + (r() - 0.5) * 0.01)
      arr.push({ d: days[i]!, o, h: Math.max(o, c) * 1.004, l: Math.min(o, c) * 0.996, c, v: 0 })
      c = c / (1 + (r() - 0.48) * 0.024)
    }
    idxCache.bars = arr.reverse()
    idxCache.end = end
  }
  const bars = idxCache.bars.filter((b) => b.d >= from)
  return { bars: interval === '1mo' ? monthly(bars) : bars, dividends: [], splits: [] }
}
