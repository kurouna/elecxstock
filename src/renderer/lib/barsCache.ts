// 足のキャッシュと先読み（NFR-A8）: ↑↓ の押しっぱなしでも速くめくれるよう、直近の銘柄の足を覚えておき、前後の銘柄を先に取っておく。
import type { Results } from '@shared/api'
import type { Adjustment, InstrumentId, Timeframe } from '@shared/types'
import { bridge } from '../stores/app.svelte'

type BarsResult = Results['bars.get']
const MAX = 90
const cache = new Map<string, Promise<BarsResult>>()

export function getBars(id: InstrumentId, tf: Timeframe, adj: Adjustment = 'split'): Promise<BarsResult> {
  const key = `${id}|${tf}|${adj}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit) // 最近使ったものを後ろへ
    return hit
  }
  const p = bridge.call('bars.get', { id, tf, adjustment: adj })
  p.catch(() => cache.delete(key))
  cache.set(key, p)
  while (cache.size > MAX) cache.delete(cache.keys().next().value!)
  return p
}
/** 前後の銘柄の足を先に取っておく（日・週・月） */
export function prefetch(ids: (InstrumentId | undefined)[]): void {
  for (const id of ids) if (id) for (const tf of ['D', 'W', 'M'] as const) void getBars(id, tf).catch(() => {})
}
/** データが更新されたら捨てる */
export function clearBars(ids?: InstrumentId[]): void {
  if (!ids || ids.includes('*')) {
    cache.clear()
    return
  }
  for (const k of [...cache.keys()]) if (ids.includes(k.split('|')[0]!)) cache.delete(k)
}
