// Yahoo へのリクエストの間隔（FR-F2）。Core のプロバイダ（yahoo.ts）と、画面の所要時間の見積もりが共有する。
//
// 2026-11-23 に 0.4 秒 + 0〜0.15 秒の揺らぎで 300 回送って 429 が出なかったので、1.0 秒 + 0〜0.3 秒から縮めた（docs/decisions.md）。
// うまくいかなくなったら YAHOO_INTERVAL_MS = 1000・YAHOO_JITTER_MS = 0 にするだけで前の速さ（揺らぎは無くなる。前と同じにするなら 300）に戻る。
// ほかのコード・テストは変えなくてよい（遅い間隔が最小間隔以下になるので 429 で遅くすることもしなくなり、所要時間の案内もこの値から作り直される）。

/** 1 リクエストの最小間隔（ms。前のリクエストを送り始めてから） */
export const YAHOO_INTERVAL_MS = 400
/** 揺らぎ（ms。0〜この値を間隔に足す） */
export const YAHOO_JITTER_MS = 150
/** 429 を受けたあとに使う間隔と揺らぎ（ms。前の既定の値）と、その長さ（ms。そのあと元の間隔から試し直す） */
export const YAHOO_SLOW_INTERVAL_MS = 1000
export const YAHOO_SLOW_JITTER_MS = 300
export const YAHOO_SLOW_FOR_MS = 24 * 60 * 60 * 1000

/** 初回の取得で取る銘柄のおおよその数（東証プライムと J-REIT。所要時間の見積もりに使う） */
export const FIRST_RUN_SYMBOLS = 1650
/** 1 リクエストあたりの、間隔に収まらない分のおおよその時間（ms。全期間の日足の応答・DB への書き込み・指標の計算） */
const OVERHEAD_MS = 50

/** 1 リクエストあたりのおおよその秒（間隔 + 揺らぎの平均 + 書き込みなど） */
export function secondsPerRequest(intervalMs: number = YAHOO_INTERVAL_MS, jitterMs: number = YAHOO_JITTER_MS): number {
  return (intervalMs + jitterMs / 2 + OVERHEAD_MS) / 1000
}

/** n 回のリクエストにかかるおおよその分（1 分未満は 1 分。0 回は 0 分） */
export function fetchMinutes(requests: number, intervalMs: number = YAHOO_INTERVAL_MS, jitterMs: number = YAHOO_JITTER_MS): number {
  if (!(requests > 0)) return 0
  return Math.max(1, Math.round((requests * secondsPerRequest(intervalMs, jitterMs)) / 60))
}

/** 3 桁ごとのカンマ（日本語・英語で同じ形。PC の言語の設定に依らない） */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ',')

/**
 * 初回の取得の案内に出す見積もり（FR-F2・FR-FR2）: 銘柄の数・リクエストの数（日足と月足の長期系列で 1 銘柄 2 回）・
 * 1 回あたりの間隔（秒。小数 1 桁）・日足など（1 銘柄 1 回）の分・そのあとの月足の長期系列（1 銘柄 1 回）の分
 */
export function firstRunEstimate(): { n: string; req: string; sec: string; min: number; monthlyMin: number } {
  const sec = Math.round((YAHOO_INTERVAL_MS + YAHOO_JITTER_MS / 2) / 100) / 10
  const min = fetchMinutes(FIRST_RUN_SYMBOLS) // 日足と月足の長期系列は、どちらも 1 銘柄 1 回
  return { n: grouped(FIRST_RUN_SYMBOLS), req: grouped(FIRST_RUN_SYMBOLS * 2), sec: String(sec), min, monthlyMin: min }
}
