// ポートフォリオのデモ・README のスクリーンショットで使う架空の保有と資産推移の記録（値はすべて架空。実際と無関係）
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// 保有（数量・取得単価はすべて架空）。口座は特定・NISA 成長投資枠・NISA つみたて投資枠に分ける
export const HOLD = [
  { code: '7203', account: 'tokutei', quantity: 100, avgCost: 15000 },
  { code: '8058', account: 'tokutei', quantity: 200, avgCost: 11000 },
  { code: '2914', account: 'tokutei', quantity: 100, avgCost: 14000 },
  { code: '9434', account: 'tokutei', quantity: 400, avgCost: 5200 },
  { code: '8306', account: 'nisa_growth', quantity: 300, avgCost: 15000 },
  { code: '8766', account: 'nisa_growth', quantity: 100, avgCost: 13000 },
  { code: '8951', account: 'nisa_growth', quantity: 2, avgCost: 95000 },
  { code: '3462', account: 'nisa_growth', quantity: 3, avgCost: 120000 },
  { code: '1308', account: 'nisa_tsumitate', quantity: 300, avgCost: 2600 },
]

/**
 * 架空の資産推移の記録（約 1 年半の平日。8306 は 1 年前は 200 株＝買い増し、2914 は今年の新規）。値は実際と無関係。
 * 評価額 ÷ 取得額の比を、終わりで今日の比（end）につなぐ（最後の点で崖にならないように）
 */
export function history(end, NOW = '2026-11-13') {
  const out = []
  const day = (d) => new Date(`${d}T00:00:00Z`)
  const iso = (t) => t.toISOString().slice(0, 10)
  let t = day('2025-05-01')
  let n = 0
  for (let u = t; iso(u) < NOW; u = new Date(u.getTime() + 86400_000)) if (u.getUTCDay() % 6) n++
  let i = 0
  while (iso(t) < NOW) {
    const d = iso(t)
    const wd = t.getUTCDay()
    if (wd !== 0 && wd !== 6) {
      const later = d >= '2026-04-01'
      const pos = HOLD.filter((h) => later || h.code !== '2914').map((h) => ({
        code: h.code,
        acct: h.account,
        qty: !later && h.code === '8306' ? 200 : h.quantity,
        cost: h.avgCost,
      }))
      const cost = pos.reduce((s, p) => s + p.qty * p.cost, 0)
      const left = 1 - (i + 1) / n
      const r = end - 0.09 * left + 0.03 * Math.sin(i / 11) * left
      out.push({ d, src: 'rec', final: true, value: Math.round(cost * r), cost, pos, at: 1 })
      i++
    }
    t = new Date(t.getTime() + 86400_000)
  }
  return out
}

/** 資産推移の記録を利用者のデータの置き場所に書く（アプリを閉じている間に。次の起動で読む） */
export function writeHistory(userData, points) {
  mkdirSync(join(userData, 'data', 'user'), { recursive: true })
  writeFileSync(join(userData, 'data', 'user', 'portfolioHistory.json'), JSON.stringify({ version: 1, data: points }))
}
