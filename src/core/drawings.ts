// チャートの描画の保存（FR-C13・C16・C17。docs/design-drawings.md §7）。利用者のデータ drawings.json（UserStore）に、
// 銘柄 → 図形 で持つ。1 本ずつ書き、読んだときの updated で確かめる（窓どうしの同時の編集で上書きしない）。
// 知らない kind・通らない図形は読み飛ばし、書き直してもファイルに残す（古い版が新しい版のファイルを読んでも消さない）。
import type { CoreError } from '@shared/api'
import {
  DRAWING_LIMIT,
  type Drawing,
  type DrawingWrite,
  drawingSchema,
  normalizeDrawing,
  readDrawings,
  type ShownLine,
  toShown,
} from '@shared/drawings'
import type { Split } from '@shared/types'
import type { UserStore } from './userstore'

type Input = Omit<Drawing, 'created' | 'updated'> & { created?: string; updated?: string }
const invalid = (message: string): CoreError => ({ code: 'invalid-params', message })
const isOf = (x: unknown, id: string) => !!x && typeof x === 'object' && (x as { id?: unknown }).id === id

export class DrawingBook {
  private last = ''
  constructor(
    private user: UserStore,
    private splits: (id: string) => Split[],
  ) {}

  private file(): Record<string, unknown[]> {
    return this.user.load('drawings') as Record<string, unknown[]>
  }
  private write(id: string, list: unknown[]): void {
    const f = { ...this.file() }
    if (list.length) f[id] = list
    else delete f[id]
    this.user.save('drawings', f as never)
  }
  /** 更新の時刻（同じミリ秒に続けて書いても、前と同じにならないようにずらす） */
  private stamp(): string {
    let t = new Date().toISOString()
    if (t <= this.last) t = new Date(Date.parse(this.last) + 1).toISOString()
    this.last = t
    return t
  }
  private check(d: Input): Drawing {
    const n = normalizeDrawing(d as Drawing)
    if (n.a.date === n.b.date) throw invalid('same bar')
    return n
  }

  all(): Record<string, Drawing[]> {
    const out: Record<string, Drawing[]> = {}
    for (const [id, list] of Object.entries(this.file())) {
      const ok = readDrawings(list)
      if (ok.length) out[id] = ok
    }
    return out
  }
  create(id: string, input: Input): DrawingWrite {
    const list = this.file()[id] ?? []
    if (list.some((x) => isOf(x, input.id))) throw invalid('exists')
    if (list.length >= DRAWING_LIMIT) throw invalid('limit')
    const t = this.stamp()
    const d = drawingSchema.parse({ ...this.check(input), created: input.created || t, updated: t })
    this.write(id, [...list, d])
    return { ok: true, drawing: d }
  }
  update(id: string, input: Input, expected: string): DrawingWrite {
    const list = this.file()[id] ?? []
    const i = list.findIndex((x) => isOf(x, input.id))
    const cur = i >= 0 ? (readDrawings([list[i]])[0] ?? null) : null
    if (!cur || cur.updated !== expected) return { ok: false, current: cur }
    const d = drawingSchema.parse({ ...this.check(input), created: cur.created, updated: this.stamp() })
    this.write(
      id,
      list.map((x, k) => (k === i ? d : x)),
    )
    return { ok: true, drawing: d }
  }
  remove(id: string, drawingId: string, expected: string): DrawingWrite {
    const list = this.file()[id] ?? []
    const i = list.findIndex((x) => isOf(x, drawingId))
    const cur = i >= 0 ? (readDrawings([list[i]])[0] ?? null) : null
    if (!cur || cur.updated !== expected) return { ok: false, current: cur }
    this.write(
      id,
      list.filter((_, k) => k !== i),
    )
    return { ok: true, drawing: cur }
  }
  /** その銘柄の図形をすべて消す（読めない図形は残す）。消したものを返す（取り消しで足し直す） */
  clear(id: string): Drawing[] {
    const list = this.file()[id] ?? []
    const removed = readDrawings(list)
    if (!removed.length) return []
    const ids = new Set(removed.map((d) => d.id))
    this.write(
      id,
      list.filter((x) => !(x && typeof x === 'object' && ids.has(String((x as { id?: unknown }).id)) && readDrawings([x]).length)),
    )
    return removed
  }
  /** タイル用: 分割調整の表示の価格にした線 */
  shown(ids: readonly string[]): Record<string, ShownLine[]> {
    const all = this.all()
    const out: Record<string, ShownLine[]> = {}
    for (const id of ids) {
      const list = all[id]
      if (!list?.length) continue
      const sp = this.splits(id)
      out[id] = list.map((d) => ({
        id: d.id,
        a: { date: d.a.date, price: toShown(d.a.raw, d.a.date, 'split', sp)! },
        b: { date: d.b.date, price: toShown(d.b.raw, d.b.date, 'split', sp)! },
        extend: d.extend,
        ...(d.color ? { color: d.color } : {}),
        ...(d.width ? { width: d.width } : {}),
        ...(d.dash ? { dash: d.dash } : {}),
      }))
    }
    return out
  }
}
