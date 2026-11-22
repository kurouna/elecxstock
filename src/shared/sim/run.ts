// 配当シミュレータの組み立て（docs/design-simulator.md §5・§6）。材料（価格・配当・業種）を受け取り、過去とこれからの結果を 1 回で返す。
// 純粋関数。Core（src/core/sim.ts）は DB から材料を読んで渡すだけ。
import { addDays, addYears } from '../calendar'
import { dpsBlocks, dpsCagr } from '../folio'
import type { Dividend, InstrumentId, JstDate } from '../types'
import {
  baseDate,
  cutCount,
  dailyStart,
  type HoldOut,
  hold,
  lastPx,
  maxDrawdown,
  monthEnds,
  type Px,
  priceAt,
  ratioOrNull,
  tradingDays,
  tradingOnOrBefore,
  wealthAt,
} from './backtest'
import {
  annualOf,
  bandOf,
  growthFactor,
  lastYearEvents,
  linearFit,
  median,
  monthShares,
  ownGrowth,
  paybackYears,
  pickStressYear,
  poolGrowth,
  type StressItem,
  shrinkGrowth,
  stressRatios,
  trendSeries,
} from './forecast'
import { groupKey, luckOf, type PeerCand, peerPath, pickPeers, rankIn } from './peers'
import { netRate, type SimExcludeReason, type SimFwd, type SimPast, type SimResult, type SimSector, type SimSettings } from './types'

export interface SimStock {
  id: InstrumentId
  kind: string
  market: string
  sector33: string
  px: Px
  divs: Dividend[]
  /** 配当の記録の始まり（取得した範囲。これより前の配当は持っていない） */
  divFrom: JstDate
  /** 上場廃止（過去にもこれからにも入れない。前提の「今上場している銘柄だけ」と合わせる） */
  delisted?: boolean
}
export interface SimInput {
  /** データの基準の日（終値のある最新の取引日） */
  today: JstDate
  settings: SimSettings
  /** 計算する銘柄（出どころの表示順。上限で切ったあと） */
  stocks: SimStock[]
  /** 出どころの全体の数 */
  total: number
  /** TOPIX 連動 ETF（無ければ比べない） */
  etf: SimStock | null
  /** 業種（key・粒度）と市場区分の全銘柄（選んだ銘柄を含んでよい） */
  members: (key: string, level: SimSector, market: string) => SimStock[]
  /** 市場区分の全銘柄（全銘柄の均等の群。§4.3。無ければ分解を出さない） */
  universe?: (market: string) => SimStock[]
  /** ストレスの年を選ぶ全銘柄の年ごとの配当 */
  stressPool: StressItem[]
  /** 当時の条件で選び直した過去の銘柄（あれば過去はこの銘柄で計算する。これからは stocks のまま） */
  rescreen?: { stocks: SimStock[]; ignored: string[] }
  /** 保有（銘柄 → 株数と税引後の割合。口座をまたいでまとめたもの）。あればこれからは実際の株数で計算する（設計 §23） */
  held?: Map<InstrumentId, { qty: number; net: number }>
}

const isReit = (s: { kind: string; market: string }) => s.kind === 'reit' || s.market === 'R'
/** 配分の割合（合計 1）: 均等、または値（利回り）に比例。値がすべて 0 以下なら均等 */
export function weightsOf(ys: number[], weight: 'equal' | 'yield'): number[] {
  const pos = ys.map((y) => (Number.isFinite(y) ? Math.max(0, y) : 0))
  const sum = pos.reduce((a, b) => a + b, 0)
  if (weight === 'equal' || !(sum > 0)) return ys.map(() => 1 / ys.length)
  return pos.map((y) => y / sum)
}

export function simulate(inp: SimInput): SimResult {
  const { today, settings: st, stocks } = inp
  const net = netRate(st.tax)
  const stale: SimResult['stale'] = []
  for (const s of stocks) {
    const lp = lastPx(s.px)
    if (lp && lp.d < today) stale.push({ id: s.id, d: lp.d })
  }
  const { past, excluded, etfMissing } = pastOf(inp, net)
  return {
    asOf: today,
    base: st.from ? tradingOnOrBefore(st.from) : baseDate(today, st.years),
    settings: st,
    ids: stocks.map((s) => s.id),
    total: inp.total,
    excluded,
    stale,
    past,
    fwd: fwdOf(inp, net),
    reitShare: stocks.length ? stocks.filter(isReit).length / stocks.length : 0,
    etfMissing,
    glitch: glitchOf([...(inp.rescreen?.stocks ?? []), ...stocks, ...(inp.etf ? [inp.etf] : [])]),
  }
}

/** データの誤りと見られる値を飛ばした銘柄の数と点の数（同じ銘柄は 1 回だけ数える） */
function glitchOf(xs: SimStock[]): SimResult['glitch'] {
  const seen = new Set<string>()
  let stocks = 0
  let points = 0
  for (const s of xs) {
    if (seen.has(s.id) || !s.px.dropped) continue
    seen.add(s.id)
    stocks++
    points += s.px.dropped
  }
  return stocks ? { stocks, points } : null
}

function pastOf(inp: SimInput, net: number): { past: SimPast | null; excluded: SimResult['excluded']; etfMissing: boolean } {
  const { today, settings: st } = inp
  // 基準日: 日付の指定があればその日以前の最後の取引日、無ければ N 年前
  const base = st.from ? tradingOnOrBefore(st.from) : baseDate(today, st.years)
  const ends = monthEnds(base, today)
  const yrs = st.from ? (Date.parse(today) - Date.parse(base)) / (365.25 * 86400_000) : st.years
  // 積立: 基準日より後・今日より前の月末ごとに足す（今日の点では足さない）
  const addDates = st.monthly > 0 ? ends.slice(1, -1) : []
  const dca = addDates.length > 0
  // 配当の記録の始まりが基準日の 14 日後までなら、記録があるとみなす（10 年前の取得の境目。その間に権利落ちがある銘柄はまれ）
  const coverLimit = addDays(base, 14)
  const excluded: { id: InstrumentId; reason: SimExcludeReason }[] = []
  const reasonOf = (s: SimStock): SimExcludeReason | null =>
    s.delisted ? 'delisted' : priceAt(s.px, base) == null ? 'noPrice' : s.divFrom > coverLimit ? 'noDivRecord' : null
  const used: SimStock[] = []
  for (const s of inp.rescreen?.stocks ?? inp.stocks) {
    const r = reasonOf(s)
    if (r) excluded.push({ id: s.id, reason: r })
    else used.push(s)
  }
  const addsOf = (w: number) => (dca ? new Map(addDates.map((d) => [d, st.monthly * w])) : undefined)
  const etfH =
    inp.etf && !reasonOf(inp.etf)
      ? hold({ px: inp.etf.px, divs: inp.etf.divs, base, amount: st.amount, reinvest: st.reinvest, net, adds: addsOf(1) }, ends)
      : null
  if (!used.length) return { past: null, excluded, etfMissing: !etfH }
  // 配分: 均等、または基準日の利回り（その時点の直近 1 年の 1 株配当 ÷ 終値）に比例（利回りがすべて 0 なら均等）
  const ws = weightsOf(
    used.map((s) => {
      const p = priceAt(s.px, base) ?? 0
      return p > 0 ? annualOf(s.divs, base, isReit(s)).d0 / p : 0
    }),
    st.weight,
  )
  const amt = ws.map((w) => st.amount * w)
  const hs = used.map(
    (s, i) => hold({ px: s.px, divs: s.divs, base, amount: amt[i]!, reinvest: st.reinvest, net, adds: addsOf(ws[i]!) }, ends)!,
  )
  const principalPath = ends.map((e) => st.amount + st.monthly * addDates.filter((d) => d <= e).length)
  const invested = principalPath.at(-1)!
  const n = ends.length
  const port = new Array<number>(n).fill(0)
  const value = new Array<number>(n).fill(0)
  const received = new Array<number>(n).fill(0)
  for (const h of hs)
    h.path.forEach((p, k) => {
      port[k]! += wealthAt(p, st.reinvest)
      value[k]! += p.v
      received[k]! += p.r
    })
  const wealth = port[n - 1]!
  const recv = received[n - 1]!

  // 同業種の均等の群（§4.1）。相手の推移は銘柄ごとに 1 回だけ計算する
  const memo = new Map<string, PeerCand | null>()
  const candOf = (s: SimStock): PeerCand | null => {
    if (memo.has(s.id)) return memo.get(s.id)!
    let c: PeerCand | null = null
    if (s.divFrom <= coverLimit) {
      const h = hold({ px: s.px, divs: s.divs, base, amount: 1, reinvest: st.reinvest, net }, ends)
      if (h) {
        const path = h.path.map((p) => wealthAt(p, st.reinvest))
        c = { id: s.id, key33: groupKey(s, 's33'), key17: groupKey(s, 's17'), market: s.market, ratio: path.at(-1)!, path }
      }
    }
    memo.set(s.id, c)
    return c
  }
  const cands = (key: string | null, level: SimSector, market: string) =>
    key ? inp.members(key, level, market).flatMap((m) => candOf(m) ?? []) : []
  const groups = used.map((s) => {
    const sel = { id: s.id, key33: groupKey(s, 's33'), key17: groupKey(s, 's17'), market: s.market }
    if (st.sector === 's33') {
      const r = pickPeers(sel, cands(sel.key33, 's33', s.market), 's33')
      if (r && !r.s17) return r
      if (sel.key33 === 'REIT') return null
    }
    const r17 = pickPeers(sel, cands(sel.key17, 's17', s.market), 's17')
    return r17 ? { peers: r17.peers, s17: st.sector === 's33' } : null
  })
  const peer = dca
    ? null
    : peerPath(
        groups.map((g, i) => ({ amount: amt[i]!, peers: g?.peers ?? null })),
        st.amount,
        n,
      )

  // 最大下落率は日足の範囲の中だけ（全銘柄に日足がある日から）
  const starts = used.map((s) => dailyStart(s.px)).filter((d): d is JstDate => !!d)
  const ddFrom = starts.length === used.length ? [base, ...starts].sort().at(-1)! : null
  let maxDD = 0
  if (ddFrom && ddFrom < today) {
    const days = tradingDays(ddFrom, today)
    const sum = new Array<number>(days.length).fill(0)
    // 積立の入金は値動きではないので、最大下落率は基準日の分（配分どおり）だけで測る
    for (const [i, s] of used.entries()) {
      const h = hold({ px: s.px, divs: s.divs, base, amount: amt[i]!, reinvest: st.reinvest, net }, days)
      h?.path.forEach((p, k) => {
        sum[k]! += wealthAt(p, st.reinvest)
      })
    }
    maxDD = maxDrawdown(sum)
  }

  // 年ごとの受け取った配当
  const y0 = Number(base.slice(0, 4))
  const yT = Number(today.slice(0, 4))
  const years: SimPast['years'] = []
  for (let y = y0; y <= yT; y++) years.push({ year: y, received: 0, extra: 0, partial: y === y0 || y === yT })
  const ago = addYears(today, -1)
  let lastYear = 0
  for (const h of hs)
    for (const e of h.events) {
      const row = years[Number(e.d.slice(0, 4)) - y0]
      if (row) {
        row.received += e.net
        row.extra += e.extra
      }
      if (e.d > ago) lastYear += e.net
    }

  // 銘柄ごとの 今の価値 ÷ 入れた金額。利回り加重で配分が 0 円の銘柄（基準日に無配）は、元本と積立を全部入れたときの値
  // （株数は端数のまま持つので金額によらない）。0 ÷ 0 で NaN にしない
  const ratios = used.map((s, i) => {
    if (amt[i]! > 0) return wealthAt(hs[i]!.path[n - 1]!, st.reinvest) / (amt[i]! + st.monthly * ws[i]! * addDates.length)
    const u = hold({ px: s.px, divs: s.divs, base, amount: st.amount, reinvest: st.reinvest, net, adds: addsOf(1) }, ends)!
    return wealthAt(u.path[n - 1]!, st.reinvest) / (st.amount + st.monthly * addDates.length)
  })
  let yocSum = 0
  const rows = used.map((s, i) => {
    const h = hs[i]!
    const end = h.path[n - 1]!
    const w = wealthAt(end, st.reinvest)
    const d0 = annualOf(s.divs, today, isReit(s)).d0
    yocSum += h.shares0 * d0
    const g = groups[i]
    // この銘柄に入れた金額（基準日の分と積立）
    const inv = amt[i]! + st.monthly * ws[i]! * addDates.length
    return {
      id: s.id,
      buy: h.buy,
      shares0: h.shares0,
      shares: h.shares,
      value: end.v,
      gain: w - inv - end.r,
      received: end.r,
      totalPct: ratios[i]! - 1,
      contrib: w - inv,
      // 順位は一括で回した相手と比べるので、積立のときは出さない
      rank:
        g && !dca
          ? {
              ...rankIn(
                ratios[i]!,
                g.peers.map((p) => p.ratio),
              ),
              s17: g.s17,
            }
          : null,
      yoc: d0 / h.buy,
      cuts: cutCount(s.divs, base, today, Math.max(1, Math.ceil(yrs))),
      monthly: h.monthlyBuy,
    }
  })
  const etf = etfH ? etfH.path.map((p) => wealthAt(p, st.reinvest)) : null
  // 全銘柄の均等の群（選んだ銘柄の市場区分の和。選んだ銘柄も入れる。§4.3）
  const markets = [...new Set(used.map((s) => s.market))]
  const allC = inp.universe && !dca ? markets.flatMap((m) => inp.universe!(m)).flatMap((s) => candOf(s) ?? []) : []
  const allEq = allC.length
    ? Array.from({ length: n }, (_, k) => (st.amount * allC.reduce((x, c) => x + (c.path[k] ?? c.ratio), 0)) / allC.length)
    : null
  // TOPIX 連動 ETF は同じ積立で回すので、入れた合計で割る（同業種・全銘柄の均等は積立のときは出さない）
  const etfPct = etf ? etf[n - 1]! / invested - 1 : null
  const peerPct = peer ? peer[n - 1]! / st.amount - 1 : null
  const allEqPct = allEq ? allEq[n - 1]! / st.amount - 1 : null
  const totalPct = wealth / invested - 1
  const decomp =
    etfPct != null && allEqPct != null && peerPct != null
      ? { etf: etfPct, size: allEqPct - etfPct, sector: peerPct - allEqPct, pick: totalPct - peerPct }
      : null
  const luck = dca
    ? null
    : luckOf(
        used.map((_, i) => ({
          mine: ratios[i]!,
          peers: groups[i]?.peers.map((p) => p.ratio) ?? [],
          w: amt[i]!,
        })),
        `${used.map((s) => s.id).join(',')}|${base}|${st.reinvest}|${st.tax}|${st.sector}|${st.weight}`,
      )
  const past: SimPast = {
    base,
    monthly: hs.some((h: HoldOut) => h.monthlyBuy),
    dailyFrom: ddFrom,
    principal: st.amount,
    principalPath,
    dates: ends,
    port,
    value,
    received,
    etf,
    peer,
    etfPct,
    peerPct,
    allEq,
    allEqPct,
    decomp,
    luck,
    rescreen: inp.rescreen ? { count: inp.rescreen.stocks.length, ignored: inp.rescreen.ignored } : null,
    hero: {
      wealth,
      value: value[n - 1]!,
      received: recv,
      invested,
      gain: wealth - invested - recv,
      totalPct,
      annual: dca || yrs < 1 ? null : (wealth / st.amount) ** (1 / yrs) - 1,
      yoc: yocSum / st.amount,
      yieldOnPrincipal: lastYear / invested,
      maxDD,
    },
    years,
    rows,
    peerInfo: { compared: groups.filter(Boolean).length, total: used.length, s17: groups.filter((g) => g?.s17).length },
  }
  return { past, excluded, etfMissing: !etfH }
}

function fwdOf(inp: SimInput, net: number): SimFwd {
  const { today, settings: st } = inp
  const thisYear = Number(today.slice(0, 4))
  const held = inp.held
  const xs = inp.stocks
    .filter((s) => !s.delisted && (!held || (held.get(s.id)?.qty ?? 0) > 0))
    .map((s) => ({ s, lp: lastPx(s.px) }))
    .filter((x): x is { s: SimStock; lp: { d: JstDate; c: number } } => !!x.lp && x.lp.c > 0)
  const fw = weightsOf(
    xs.map(({ s, lp }) => annualOf(s.divs, today, isReit(s)).d0 / lp.c),
    st.weight,
  )
  // 保有のとき: 元本は今の評価額（株数 × 今日の終値）
  const amount = held ? xs.reduce((s, { s: x, lp }) => s + (held.get(x.id)?.qty ?? 0) * lp.c, 0) : st.amount
  const stress = pickStressYear(inp.stressPool, thisYear)
  const rs = stress
    ? stressRatios(
        inp.stressPool,
        stress.year,
        xs.map(({ s }) => ({ id: s.id, s17: groupKey(s, 's17') })),
        thisYear,
      )
    : null
  // 伸びを見込むとき: 業種（17 業種）の中央値・市場全体の中央値（母集団の暦年の合計から）
  const growth = st.method === 'growth'
  const by17 = new Map<string, number[]>()
  const all: number[] = []
  if (growth)
    for (const i of inp.stressPool) {
      const g = poolGrowth(i, thisYear)
      if (g == null) continue
      all.push(g)
      if (i.s17) by17.set(i.s17, [...(by17.get(i.s17) ?? []), g])
    }
  const mkt = median(all) ?? 0
  const months = new Array<number>(12).fill(0)
  /** 銘柄ごとの 1 年目の前の配当（D₀ × 株数 × 税）・伸び・ストレスの前年比 */
  /** 銘柄ごと: at(t) は t 年目の配当（減配シナリオの前）、r は減配シナリオの前年比（1 まで） */
  const parts: { id: string; s17: string | null; at: (t: number) => number; r: number }[] = []
  const rows = xs.map(({ s, lp }, i) => {
    const reit = isReit(s)
    const an = annualOf(s.divs, today, reit)
    const h = held?.get(s.id)
    const shares = h ? h.qty : (st.amount * fw[i]!) / lp.c
    const v = shares * an.d0 * (h ? h.net : net)
    const r = rs?.get(s.id) ?? { r: 1, src: 'none' as const }
    const short = an.years < 4 || an.d0 === 0
    // 期間不足・無配は伸びを見込まない
    let g = 0
    if (growth && !short) {
      const own = ownGrowth(s.divs, today)
      const k = groupKey(s, 's17')
      g = shrinkGrowth(own.g, own.n, (k ? median(by17.get(k) ?? []) : null) ?? mkt)
    }
    // 直線トレンド試算: 年ごとの 1 株配当に直線を当てて延ばす（期間不足・無配は横ばい）
    const series = st.method === 'trend' && !short ? trendSeries(s.divs, today) : null
    const fit = series ? linearFit(series) : null
    const per = h ? h.net : net
    const nPts = series?.length ?? 0
    const at = fit ? (t: number) => shares * per * fit.at(nPts - 1 + t) : (t: number) => v * growthFactor(g, t)
    parts.push({ id: s.id, s17: groupKey(s, 's17'), at, r: Math.min(1, r.r) })
    const v1 = at(1)
    const ms = monthShares(s.divs, today, reit).map((x) => x * v1)
    ms.forEach((x, i) => {
      months[i]! += x
    })
    return {
      id: s.id,
      price: lp.c,
      shares,
      d0: an.d0,
      years: an.years,
      growth5: dpsCagr(dpsBlocks(s.divs, today, 5).dps),
      y1: v1,
      g,
      r: r.r,
      rSrc: r.src,
      exMonths: [...new Set(lastYearEvents(s.divs, today).map((d) => Number(d.date.slice(5, 7))))],
      months: ms,
      short,
    }
  })
  // 年ごと: 選んだ方式の線と、同じ線に 1 年目の前年比（ストレス）を当て続けた線
  const years: SimFwd['years'] = []
  let cum = 0
  for (let t = 1; t <= st.horizon; t++) {
    let value = 0
    let stressV = 0
    for (const p of parts) {
      const x = p.at(t)
      value += x
      stressV += x * p.r
    }
    cum += value
    years.push({ year: t, value, stress: stressV, cum })
  }
  const y1 = years[0]?.value ?? 0
  const stressY1 = years[0]?.stress ?? 0
  const diff = ratioOrNull(stressY1, y1)
  return {
    amount,
    held: !!held,
    rows,
    y1,
    yieldOnPrincipal: y1 > 0 && amount > 0 ? y1 / amount : null,
    cum,
    stress,
    stressY1,
    paybackYears: paybackYears((t) => parts.reduce((a, p) => a + p.at(t), 0), amount),
    stressDiff: diff == null ? null : diff - 1,
    years,
    months,
    band: bandOf(
      parts.map((p) => ({ id: p.id, s17: p.s17, line: years.map((_, t) => p.at(t + 1)) })),
      inp.stressPool,
      thisYear,
      `${xs.map((x) => x.s.id).join(',')}|${st.method}|${st.horizon}|${st.amount}|${st.tax}`,
    ),
  }
}
