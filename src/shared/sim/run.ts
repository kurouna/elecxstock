// 配当シミュレータの組み立て（docs/design-simulator.md §5・§6）。材料（価格・配当・業種）を受け取り、過去とこれからの結果を 1 回で返す。
// 純粋関数。Core（src/core/sim.ts）は DB から材料を読んで渡すだけ。
import { addYears } from '../calendar'
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
  wealthAt,
} from './backtest'
import {
  annualOf,
  growthFactor,
  lastYearEvents,
  median,
  monthShares,
  ownGrowth,
  paybackYears,
  pickStressYear,
  poolGrowth,
  type StressItem,
  shrinkGrowth,
  stressRatios,
} from './forecast'
import { groupKey, type PeerCand, peerPath, pickPeers, rankIn } from './peers'
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
  /** 1306（無ければ比べない） */
  etf: SimStock | null
  /** 業種（key・粒度）と市場区分の全銘柄（選んだ銘柄を含んでよい） */
  members: (key: string, level: SimSector, market: string) => SimStock[]
  /** ストレスの年を選ぶ全銘柄の年ごとの配当 */
  stressPool: StressItem[]
  /** 保有（銘柄 → 株数と税引後の割合。口座をまたいでまとめたもの）。あればこれからは実際の株数で計算する（設計 §23） */
  held?: Map<InstrumentId, { qty: number; net: number }>
}

const isReit = (s: { kind: string; market: string }) => s.kind === 'reit' || s.market === 'R'

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
    base: baseDate(today, st.years),
    settings: st,
    ids: stocks.map((s) => s.id),
    total: inp.total,
    excluded,
    stale,
    past,
    fwd: fwdOf(inp, net),
    reitShare: stocks.length ? stocks.filter(isReit).length / stocks.length : 0,
    etfMissing,
  }
}

function pastOf(inp: SimInput, net: number): { past: SimPast | null; excluded: SimResult['excluded']; etfMissing: boolean } {
  const { today, settings: st } = inp
  const base = baseDate(today, st.years)
  const ends = monthEnds(base, today)
  const excluded: { id: InstrumentId; reason: SimExcludeReason }[] = []
  const reasonOf = (s: SimStock): SimExcludeReason | null =>
    s.delisted ? 'delisted' : priceAt(s.px, base) == null ? 'noPrice' : s.divFrom > base ? 'noDivRecord' : null
  const used: SimStock[] = []
  for (const s of inp.stocks) {
    const r = reasonOf(s)
    if (r) excluded.push({ id: s.id, reason: r })
    else used.push(s)
  }
  const etfH =
    inp.etf && !reasonOf(inp.etf)
      ? hold({ px: inp.etf.px, divs: inp.etf.divs, base, amount: st.amount, reinvest: st.reinvest, net }, ends)
      : null
  if (!used.length) return { past: null, excluded, etfMissing: !etfH }
  const a = st.amount / used.length
  const hs = used.map((s) => hold({ px: s.px, divs: s.divs, base, amount: a, reinvest: st.reinvest, net }, ends)!)
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
    if (s.divFrom <= base) {
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
  const peer = peerPath(
    groups.map((g) => ({ amount: a, peers: g?.peers ?? null })),
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
    for (const s of used) {
      const h = hold({ px: s.px, divs: s.divs, base, amount: a, reinvest: st.reinvest, net }, days)
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

  let yocSum = 0
  const rows = used.map((s, i) => {
    const h = hs[i]!
    const end = h.path[n - 1]!
    const w = wealthAt(end, st.reinvest)
    const d0 = annualOf(s.divs, today, isReit(s)).d0
    yocSum += h.shares0 * d0
    const g = groups[i]
    return {
      id: s.id,
      buy: h.buy,
      shares0: h.shares0,
      shares: h.shares,
      value: end.v,
      gain: w - a - end.r,
      received: end.r,
      totalPct: w / a - 1,
      contrib: w - a,
      rank: g
        ? {
            ...rankIn(
              w / a,
              g.peers.map((p) => p.ratio),
            ),
            s17: g.s17,
          }
        : null,
      yoc: d0 / h.buy,
      cuts: cutCount(s.divs, base, today, st.years),
      monthly: h.monthlyBuy,
    }
  })
  const etf = etfH ? etfH.path.map((p) => wealthAt(p, st.reinvest)) : null
  const past: SimPast = {
    base,
    monthly: hs.some((h: HoldOut) => h.monthlyBuy),
    dailyFrom: ddFrom,
    principal: st.amount,
    dates: ends,
    port,
    value,
    received,
    etf,
    peer,
    etfPct: etf ? etf[n - 1]! / st.amount - 1 : null,
    peerPct: peer ? peer[n - 1]! / st.amount - 1 : null,
    hero: {
      wealth,
      value: value[n - 1]!,
      received: recv,
      gain: wealth - st.amount - recv,
      totalPct: wealth / st.amount - 1,
      annual: (wealth / st.amount) ** (1 / st.years) - 1,
      yoc: yocSum / st.amount,
      yieldOnPrincipal: lastYear / st.amount,
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
  const a = xs.length ? st.amount / xs.length : 0
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
  const parts: { v: number; g: number; r: number }[] = []
  const rows = xs.map(({ s, lp }) => {
    const reit = isReit(s)
    const an = annualOf(s.divs, today, reit)
    const h = held?.get(s.id)
    const shares = h ? h.qty : a / lp.c
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
    parts.push({ v, g, r: Math.min(1, r.r) })
    const v1 = v * growthFactor(g, 1)
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
      const x = p.v * growthFactor(p.g, t)
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
    paybackYears: paybackYears((t) => parts.reduce((a, p) => a + p.v * growthFactor(p.g, t), 0), amount),
    stressDiff: diff == null ? null : diff - 1,
    years,
    months,
  }
}
