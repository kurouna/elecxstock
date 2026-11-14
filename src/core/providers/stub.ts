// テスト・スクリーンショット用のスタブ（ELECXSTOCK_PROVIDER=stub）。外部に一切接続しない（§11）。
// 銘柄名は実在だが、価格・配当はすべて乱数の架空の値。
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
  ['7203', 'トヨタ自動車', 'TOYOTA MOTOR CORPORATION', 'P', 'stock', '輸送用機器', 'Transportation Equipment', 3400, 2.9, [3, 9]],
  ['8058', '三菱商事', 'MITSUBISHI CORPORATION', 'P', 'stock', '卸売業', 'Wholesale Trade', 5300, 2.3, [3, 9]],
  ['8306', '三菱UFJフィナンシャル・グループ', 'Mitsubishi UFJ Financial Group,Inc.', 'P', 'stock', '銀行業', 'Banks', 3500, 2.7, [3, 9]],
  ['8316', '三井住友フィナンシャルグループ', 'Sumitomo Mitsui Financial Group,Inc.', 'P', 'stock', '銀行業', 'Banks', 4300, 3.1, [3, 9]],
  ['8411', 'みずほフィナンシャルグループ', 'Mizuho Financial Group,Inc.', 'P', 'stock', '銀行業', 'Banks', 5200, 2.9, [3, 9]],
  ['9432', '日本電信電話', 'NTT,Inc.', 'P', 'stock', '情報・通信業', 'Information & Communication', 158, 3.4, [3, 9]],
  ['9433', 'KDDI', 'KDDI CORPORATION', 'P', 'stock', '情報・通信業', 'Information & Communication', 2600, 3.0, [3, 9]],
  ['9434', 'ソフトバンク', 'SoftBank Corp.', 'P', 'stock', '情報・通信業', 'Information & Communication', 237, 3.7, [3, 9]],
  ['2914', '日本たばこ産業', 'JAPAN TOBACCO INC.', 'P', 'stock', '食料品', 'Foods', 4700, 4.6, [6, 12]],
  ['8001', '伊藤忠商事', 'ITOCHU Corporation', 'P', 'stock', '卸売業', 'Wholesale Trade', 8900, 2.2, [3, 9]],
  ['8031', '三井物産', 'MITSUI & CO.,LTD.', 'P', 'stock', '卸売業', 'Wholesale Trade', 3600, 3.0, [3, 9]],
  ['8053', '住友商事', 'SUMITOMO CORPORATION', 'P', 'stock', '卸売業', 'Wholesale Trade', 4100, 3.3, [3, 9]],
  ['4502', '武田薬品工業', 'Takeda Pharmaceutical Company Limited', 'P', 'stock', '医薬品', 'Pharmaceutical', 4300, 4.6, [3, 9]],
  ['8766', '東京海上ホールディングス', 'Tokio Marine Holdings,Inc.', 'P', 'stock', '保険業', 'Insurance', 5900, 2.6, [3, 9]],
  ['5401', '日本製鉄', 'NIPPON STEEL CORPORATION', 'P', 'stock', '鉄鋼', 'Iron & Steel', 3300, 4.2, [3, 9]],
  ['1605', 'INPEX', 'INPEX CORPORATION', 'P', 'stock', '鉱業', 'Mining', 2400, 4.0, [6, 12]],
  ['6501', '日立製作所', 'Hitachi,Ltd.', 'P', 'stock', '電気機器', 'Electric Appliances', 4500, 1.0, [3, 9]],
  ['6758', 'ソニーグループ', 'Sony Group Corporation', 'P', 'stock', '電気機器', 'Electric Appliances', 3900, 0.6, [3, 9]],
  ['7974', '任天堂', 'Nintendo Co.,Ltd.', 'P', 'stock', 'その他製品', 'Other Products', 12500, 1.2, [3, 9]],
  ['4063', '信越化学工業', 'Shin-Etsu Chemical Co.,Ltd.', 'P', 'stock', '化学', 'Chemicals', 5200, 2.0, [3, 9]],
  ['8591', 'オリックス', 'ORIX CORPORATION', 'P', 'stock', 'その他金融業', 'Other Financing Business', 3800, 3.8, [3, 9]],
  ['5020', 'ENEOSホールディングス', 'ENEOS Holdings,Inc.', 'P', 'stock', '石油・石炭製品', 'Oil & Coal Products', 1050, 2.1, [3, 9]],
  [
    '94345',
    'ソフトバンク第1回社債型種類株式',
    'SoftBank Corp. Bond-type Class Shares 1',
    'P',
    'pref',
    '情報・通信業',
    'Information & Communication',
    3790,
    2.6,
    [3, 9],
  ],
  ['130A', 'Veritas In Silico', 'Veritas In Silico Inc.', 'G', 'stock', '医薬品', 'Pharmaceutical', 255, 0, []],
  ['8951', '日本ビルファンド投資法人', 'Nippon Building Fund Inc.', 'R', 'reit', '', '', 119000, 4.2, [6, 12]],
  ['8952', 'ジャパンリアルエステイト投資法人', 'Japan Real Estate Investment Corporation', 'R', 'reit', '', '', 123000, 4.1, [3, 9]],
  ['3462', '野村不動産マスターファンド投資法人', 'Nomura Real Estate Master Fund,Inc.', 'R', 'reit', '', '', 124000, 5.9, [2, 8]],
  ['3283', '日本プロロジスリート投資法人', 'Nippon Prologis REIT,Inc.', 'R', 'reit', '', '', 86000, 4.5, [5, 11]],
  ['8953', '日本都市ファンド投資法人', 'Japan Metropolitan Fund Investment Corporation', 'R', 'reit', '', '', 102000, 5.9, [2, 8]],
  ['3269', 'アドバンス・レジデンス投資法人', 'Advance Residence Investment Corporation', 'R', 'reit', '', '', 155000, 4.2, [1, 7]],
  ['8963', 'インヴィンシブル投資法人', 'Invincible Investment Corporation', 'R', 'reit', '', '', 66000, 6.2, [6, 12]],
  ['3281', 'GLP投資法人', 'GLP J-REIT', 'R', 'reit', '', '', 136000, 5.2, [2, 8]],
  ['1306', 'NEXT FUNDS TOPIX連動型上場投信', 'NEXT FUNDS TOPIX Exchange Traded Fund', 'E', 'etf', '', '', 414, 1.9, [7]],
  [
    '9282',
    'いちごグリーンインフラ投資法人',
    'Ichigo Green Infrastructure Investment Corporation',
    'X',
    'other',
    '',
    '',
    52000,
    6.0,
    [6, 12],
  ],
]
const BY = new Map(U.map((s) => [s[0], s]))

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
function series(code: string) {
  const hit = cache.get(code)
  if (hit) return hit
  const s = BY.get(code)
  if (!s) throw new Error('no data')
  const [, , , , kind, , , base, yld, months] = s
  const r = rng(code)
  const end = lastClosedSession()
  const days: string[] = []
  for (let d = '2000-01-04'; d <= end; d = addDays(d, 1)) if (isTradingDay(d)) days.push(d)
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
        if (d > end) continue
        const g = (kind === 'reit' ? 1.02 : 1.06) ** (y - Number(end.slice(0, 4)))
        const per = ((base * yld) / 100 / months.length) * g * (0.97 + r() * 0.06)
        dividends.push({ date: d, amount: base >= 10000 ? Math.round(per) : Math.round(per * 10) / 10 })
      }
    }
  }
  const splits: Split[] = code === '7203' ? [{ date: '2021-09-29', ratio: 5 }] : code === '9434' ? [{ date: '2024-09-27', ratio: 10 }] : []
  const out = { bars, dividends, splits }
  cache.set(code, out)
  return out
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
      const code = symbol.replace(/\.T$/, '').replace(/^\^/, '')
      if (code === 'N225') return idx(from, interval)
      const s = series(code)
      const bars = s.bars.filter((b) => b.d >= from)
      if (interval === '1mo') return { bars: monthly(bars), dividends: s.dividends.filter((d) => d.date >= from), splits: [] }
      return { bars, dividends: s.dividends.filter((d) => d.date >= from), splits: s.splits.filter((x) => x.date >= from) }
    },
    async fetchQuotes(symbols): Promise<ProviderQuote[]> {
      const { minutes } = jstNow()
      return symbols.flatMap((sym) => {
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
const idxCache: { bars?: RawBar[] } = {}
function idx(from: string, interval: '1d' | '1mo'): HistoryResult {
  if (!idxCache.bars) {
    const r = rng('N225')
    const end = lastClosedSession()
    const days: string[] = []
    for (let d = '2000-01-04'; d <= end; d = addDays(d, 1)) if (isTradingDay(d)) days.push(d)
    let c = 61000
    const arr: RawBar[] = []
    for (let i = days.length - 1; i >= 0; i--) {
      const o = c * (1 + (r() - 0.5) * 0.01)
      arr.push({ d: days[i]!, o, h: Math.max(o, c) * 1.004, l: Math.min(o, c) * 0.996, c, v: 0 })
      c = c / (1 + (r() - 0.48) * 0.024)
    }
    idxCache.bars = arr.reverse()
  }
  const bars = idxCache.bars.filter((b) => b.d >= from)
  return { bars: interval === '1mo' ? monthly(bars) : bars, dividends: [], splits: [] }
}
