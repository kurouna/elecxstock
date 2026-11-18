// 配当シミュレータの同業種との比較（docs/design-simulator.md §4.1・§4.2）。純粋関数。
import { sector17Of } from '../sectors'
import { seededRng } from './forecast'
import type { SimSector } from './types'

/** 比べる最小の相手の数（これ未満なら 17 業種へ切り替える） */
const PEER_MIN = 5

/** 業種の分け方: J-REIT はまとめて 1 つ。ETF・ETN・指数・業種の無い銘柄は比べない（null） */
export function groupKey(i: { kind: string; market: string; sector33: string }, level: SimSector): string | null {
  if (i.kind === 'reit' || i.market === 'R') return 'REIT'
  if (i.kind !== 'stock' || !i.sector33) return null
  return level === 's33' ? i.sector33 : sector17Of(i.sector33)
}

export interface PeerCand {
  id: string
  key33: string | null
  key17: string | null
  market: string
  /** 今の価値 ÷ 入れた金額（トータルリターン + 1） */
  ratio: number
  /** 推移の点ごとの 今の価値 ÷ 入れた金額 */
  path: number[]
}

/**
 * 選んだ銘柄の同業種の相手（§4.1）: 自分を外し、市場区分をそろえる。33 業種で 5 未満なら 17 業種に切り替え、それでも 5 未満なら null。
 * level が s17 なら初めから 17 業種
 */
export function pickPeers(
  sel: { id: string; key33: string | null; key17: string | null; market: string },
  cands: PeerCand[],
  level: SimSector,
  min = PEER_MIN,
): { peers: PeerCand[]; s17: boolean } | null {
  const of = (k: 'key33' | 'key17') =>
    sel[k] == null ? [] : cands.filter((c) => c.id !== sel.id && c.market === sel.market && c[k] === sel[k])
  if (level === 's33') {
    const p33 = of('key33')
    if (p33.length >= min) return { peers: p33, s17: false }
    // J-REIT は 17 業種でもまとめて 1 つなので、切り替えても相手は増えない
    if (sel.key33 === 'REIT') return null
  }
  const p17 = of('key17')
  return p17.length >= min ? { peers: p17, s17: level === 's33' } : null
}

/**
 * 同業種の均等の群の推移（円）。選んだ銘柄 i の業種の相手の平均の推移を、i の構成比で足す。
 * 比べられない銘柄があるときは、比べられた銘柄の構成比で元本の全額を配り直す（§4.1 の 5）。1 つも比べられなければ null
 */
export function peerPath(sel: { amount: number; peers: PeerCand[] | null }[], principal: number, n: number): number[] | null {
  const ok = sel.filter((s): s is { amount: number; peers: PeerCand[] } => !!s.peers?.length)
  const sum = ok.reduce((a, s) => a + s.amount, 0)
  if (!ok.length || !(sum > 0)) return null
  const out = new Array<number>(n).fill(0)
  for (const s of ok) {
    const w = (s.amount / sum) * principal
    for (let k = 0; k < n; k++) {
      let m = 0
      for (const p of s.peers) m += p.path[k] ?? p.ratio
      out[k]! += (w * m) / s.peers.length
    }
  }
  return out
}

/** 同業種の中の順位（自分を入れて k/n。上が 1） */
export function rankIn(ratio: number, peers: number[]): { k: number; n: number } {
  return { k: 1 + peers.filter((x) => x > ratio + 1e-12).length, n: peers.length + 1 }
}

/** 偶然との比較の抽選の回数・ヒストグラムの区切りの数 */
const LUCK_DRAWS = 1000
const LUCK_BINS = 30
export interface Luck {
  /** 選んだ群が、無作為の群の中で下から何 % にいるか（0〜1。同じ値は半分に数える） */
  pct: number
  /** 選んだ群（比べられた銘柄だけ）のトータルリターン */
  mine: number
  /** 無作為の群のトータルリターンの分布（lo〜hi を LUCK_BINS に区切った数） */
  bins: number[]
  lo: number
  hi: number
}
/**
 * 偶然との比較（§4.4）: 比べられた銘柄ごとに、同じ業種の相手から 1 銘柄を無作為に選び、同じ構成の群を作る（均等の金額）。
 * 1,000 回の中で、選んだ群のトータルリターンが下から何 % にいるか。順位であって検定ではない。比べられる銘柄が無ければ null
 */
export function luckOf(groups: { mine: number; peers: number[]; w?: number }[], seed: string): Luck | null {
  const gs = groups.filter((g) => g.peers.length > 0)
  if (!gs.length) return null
  // 銘柄ごとの重み（配分の金額。無ければ均等）で平均する。無作為の群も同じ重み
  const ws = gs.map((g) => (g.w != null && g.w > 0 ? g.w : 1))
  const wsum = ws.reduce((a, b) => a + b, 0)
  const mine = gs.reduce((a, g, i) => a + g.mine * ws[i]!, 0) / wsum - 1
  const next = seededRng(seed)
  const draws = new Float64Array(LUCK_DRAWS)
  for (let k = 0; k < LUCK_DRAWS; k++) {
    let sum = 0
    gs.forEach((g, i) => {
      sum += g.peers[Math.floor(next() * g.peers.length)]! * ws[i]!
    })
    draws[k] = sum / wsum - 1
  }
  let below = 0
  for (const d of draws) below += d < mine - 1e-12 ? 1 : Math.abs(d - mine) <= 1e-12 ? 0.5 : 0
  const lo = Math.min(mine, ...draws)
  const hi = Math.max(mine, ...draws)
  const bins = new Array<number>(LUCK_BINS).fill(0)
  const w = hi > lo ? (hi - lo) / LUCK_BINS : 1
  for (const d of draws) bins[Math.min(LUCK_BINS - 1, Math.floor((d - lo) / w))]! += 1
  return { pct: below / LUCK_DRAWS, mine, bins, lo, hi }
}
