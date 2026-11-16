// プライバシーモード（FR-H12）: 資産の大きさが分かる値（保有の金額と数量）を **** にする。
// %（損益率・構成比・利回り）・平均取得単価・株価は隠さない（数量と金額が隠れていれば資産の大きさは分からない）。
// 正は設定の privacyMode。App.svelte が設定を読むたびにここへ写す（どの窓でも同じ。lib/ の純粋な関数が画面の状態を読まずに済む）
export const MASK = '****'
export const privacy = $state({ on: false })
/** オンなら MASK、オフなら s */
export const secret = (s: string): string => (privacy.on ? MASK : s)
