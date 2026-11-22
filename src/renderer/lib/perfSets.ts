// パフォーマンス比較の「比較の組」（docs/design-perf.md §2.6）。今はディスクに保存せず、renderer のメモリだけに持つ
// （アプリを閉じると忘れる）。あとで保存するときは、この読み書きを利用者のデータ（JSON）に差し替える
import type { InstrumentId, JstDate } from '@shared/types'
import type { PfMode } from './perf'

export interface PerfSet {
  name: string
  base: JstDate | null
  end: JstDate | null
  ids: InstrumentId[]
  bench: InstrumentId[]
  mode: PfMode
  total: boolean
  log: boolean
}
const copy = (s: PerfSet): PerfSet => ({ ...s, ids: [...s.ids], bench: [...s.bench] })

export class PerfSetStore {
  private sets = new Map<string, PerfSet>()
  list(): PerfSet[] {
    return [...this.sets.values()].map(copy)
  }
  get(name: string): PerfSet | undefined {
    const s = this.sets.get(name)
    return s ? copy(s) : undefined
  }
  /** 同じ名前は置き換える（並びの位置は変えない） */
  save(s: PerfSet): void {
    this.sets.set(s.name, copy(s))
  }
  remove(name: string): void {
    this.sets.delete(name)
  }
}
/** アプリ全体（この窓）で 1 つ */
export const perfSets = new PerfSetStore()
