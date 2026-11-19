// 描画の書き込み（docs/design-drawings.md §7.3・§7.4）: 手元（窓のストア）を先に変えて描き、Core へはまとめて 1 本ずつ書く。
// 読んだときの updated で確かめ、ほかの窓で変わっていたら手元を今の値にして知らせる。取り消しはペインと銘柄ごと（scope）に持つ。
// Core への書き込みは 1 本の列で順に行う（返事を待たずに続けて押しても順が崩れない）。
// Svelte に依存しない（L4 のテストで偽の Core とつなぐ）。窓のストアとのつなぎは store.svelte.ts
import type { Drawing, DrawingWrite } from '@shared/drawings'

export interface DrawingIO {
  create(id: string, d: Drawing): Promise<DrawingWrite>
  update(id: string, d: Drawing, expected: string): Promise<DrawingWrite>
  remove(id: string, drawingId: string, expected: string): Promise<DrawingWrite>
  clear(id: string): Promise<Drawing[]>
}
export interface DrawingStore {
  list(id: string): readonly Drawing[]
  put(id: string, list: Drawing[]): void
}
export type DrawingNotice = 'conflict' | 'failed'

type Op =
  | { t: 'create'; id: string; d: Drawing }
  | { t: 'update'; id: string; before: Drawing; after: Drawing }
  | { t: 'remove'; id: string; d: Drawing }
  | { t: 'clear'; id: string; list: Drawing[] }
interface Pending {
  scope: string
  id: string
  /** 書く前の値（Core の値。作った返事を待っている間は null） */
  before: Drawing | null
  /** 手元の最新の値（消して手元から外したあとも、書きかけを書くのに使う） */
  last: Drawing
  timer: ReturnType<typeof setTimeout> | null
}
/** 取り消しの段の上限（スコープごと） */
const DEPTH = 50
/** 図形の中身（時刻を除く）が同じか */
const same = (x: Drawing, y: Drawing) =>
  JSON.stringify({ ...x, created: '', updated: '' }) === JSON.stringify({ ...y, created: '', updated: '' })

export class DrawingEdits {
  private pending = new Map<string, Pending>()
  private hist = new Map<string, { undo: Op[]; redo: Op[] }>()
  /** 作った返事を待っている図形 */
  private creating = new Set<string>()
  /** 消す返事を待っている図形（その間の読み直しで手元に戻さない） */
  private removing = new Set<string>()
  /** 消す途中に書きかけを書いたときの Core の値（消すときの expected に使う） */
  private latest = new Map<string, Drawing>()
  private chain: Promise<unknown> = Promise.resolve()
  /** スコープごとの書き込み中の数 */
  private busy = new Map<string, number>()
  constructor(
    private io: DrawingIO,
    private store: DrawingStore,
    private notify: (n: DrawingNotice) => void,
    private delay = 300,
  ) {}

  private find(id: string, drawingId: string): Drawing | undefined {
    return this.store.list(id).find((d) => d.id === drawingId)
  }
  /** 手元の 1 本を置き換える（null は消す。無ければ足す） */
  private set(id: string, drawingId: string, d: Drawing | null): void {
    const list = this.store.list(id)
    const has = list.some((x) => x.id === drawingId)
    if (d == null) {
      if (has)
        this.store.put(
          id,
          list.filter((x) => x.id !== drawingId),
        )
    } else this.store.put(id, has ? list.map((x) => (x.id === drawingId ? d : x)) : [...list, d])
  }
  private stack(scope: string) {
    let h = this.hist.get(scope)
    if (!h) {
      h = { undo: [], redo: [] }
      this.hist.set(scope, h)
    }
    return h
  }
  private push(scope: string, op: Op): void {
    const h = this.stack(scope)
    h.undo.push(op)
    if (h.undo.length > DEPTH) h.undo.shift()
    h.redo = []
  }
  /**
   * 自分の書き込みで図形の updated が変わった: 履歴の中の同じ図形の updated を張り替える（続けて戻すときに、自分の書き込みを
   * ほかの窓の変更と取り違えない）。ほかの窓の変更は張り替えないので、戻すときに断られて知らせる
   */
  private rebase(d: Drawing, prev: string): void {
    // 書く直前の版（prev）を持つ段だけ。ほかの窓の変更より前の段は張り替えない（戻すときに断られて知らせる）
    const fix = (x: Drawing) => (x.id === d.id && x.updated === prev ? { ...x, updated: d.updated } : x)
    for (const h of this.hist.values())
      for (const ops of [h.undo, h.redo])
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i]!
          if (op.t === 'update') ops[i] = { ...op, before: fix(op.before), after: fix(op.after) }
          else if (op.t === 'clear') ops[i] = { ...op, list: op.list.map(fix) }
          else ops[i] = { ...op, d: fix(op.d) }
        }
  }
  /** 断られた: 手元を今の値にして知らせる */
  private conflict(id: string, drawingId: string, current: Drawing | null): void {
    this.set(id, drawingId, current)
    this.notify('conflict')
  }
  private run<T>(scope: string, f: () => Promise<T>): Promise<T> {
    this.busy.set(scope, (this.busy.get(scope) ?? 0) + 1)
    const p = this.chain.then(f).finally(() => this.busy.set(scope, (this.busy.get(scope) ?? 1) - 1))
    this.chain = p.catch(() => {})
    return p
  }
  private busyIn(scope: string): boolean {
    if ((this.busy.get(scope) ?? 0) > 0) return true
    for (const p of this.pending.values()) if (p.scope === scope) return true
    return false
  }

  editing(drawingId: string): boolean {
    return this.pending.has(drawingId)
  }
  /** 戻せるか（このスコープの書き込みの途中は、終わると戻せるものがあるかもしれないので true） */
  canUndo(scope: string): boolean {
    return this.busyIn(scope) || !!this.hist.get(scope)?.undo.length
  }
  /** やり直せるか（書き込み中は true。書きかけは新しい編集で、やり直しの段を消す側なので数えない） */
  canRedo(scope: string): boolean {
    return (this.busy.get(scope) ?? 0) > 0 || !!this.hist.get(scope)?.redo.length
  }

  create(scope: string, id: string, d: Drawing): Promise<Drawing | null> {
    this.set(id, d.id, d)
    this.creating.add(d.id)
    return this.run(scope, () => this.doCreate(scope, id, d))
  }
  private async doCreate(scope: string, id: string, d: Drawing): Promise<Drawing | null> {
    try {
      const r = await this.io.create(id, d)
      if (!r.ok) throw new Error('rejected')
      const p = this.pending.get(d.id)
      // 返事を待つ間に動かしていたら、手元の値は残し、書く前の値を Core の値にする
      if (p) p.before = r.drawing
      else this.set(id, d.id, r.drawing)
      this.push(scope, { t: 'create', id, d: r.drawing })
      return r.drawing
    } catch {
      const p = this.pending.get(d.id)
      if (p?.timer) clearTimeout(p.timer)
      this.pending.delete(d.id)
      this.set(id, d.id, null)
      this.notify('failed')
      return null
    } finally {
      this.creating.delete(d.id)
    }
  }
  /**
   * 動かす・直す: 手元をすぐ変え、最後の操作から delay ms 後にまとめて書く（1 段の取り消しになる）。
   * hold（ドラッグの間）はタイマーを張らず、flush で書く
   */
  edit(scope: string, id: string, d: Drawing, opts: { hold?: boolean } = {}): void {
    const cur = this.find(id, d.id)
    if (!cur) return
    let p = this.pending.get(d.id)
    if (!p) {
      if (same(cur, d)) return
      p = { scope, id, before: this.creating.has(d.id) ? null : cur, last: d, timer: null }
      this.pending.set(d.id, p)
    }
    p.last = d
    this.set(id, d.id, d)
    if (p.timer) clearTimeout(p.timer)
    p.timer = opts.hold ? null : setTimeout(() => void this.flush(d.id), this.delay)
  }
  /** 書いていない変更をいま書く（drawingId を省くとすべて） */
  flush(drawingId?: string): Promise<void> {
    const scope = (drawingId && this.pending.get(drawingId)?.scope) || ''
    return this.run(scope, () => this.doFlush(drawingId))
  }
  private async doFlush(drawingId?: string): Promise<void> {
    const keys = drawingId ? [drawingId] : [...this.pending.keys()]
    for (const k of keys) {
      const p = this.pending.get(k)
      if (!p) continue
      if (p.timer) clearTimeout(p.timer)
      this.pending.delete(k)
      // 消す途中（手元から外した）なら、書きかけの最新の値を書く
      const cur = this.find(p.id, k) ?? (this.removing.has(k) ? p.last : undefined)
      const before = p.before
      if (!cur || !before) continue
      if (same(cur, before)) {
        this.set(p.id, k, before)
        continue
      }
      this.busy.set(p.scope, (this.busy.get(p.scope) ?? 0) + 1)
      try {
        const r = await this.io.update(p.id, cur, before.updated)
        if (r.ok) {
          // 書いている間にさらに動かしていたら、手元の値は残す（次のまとめで書く）
          const again = this.pending.get(k)
          if (again) again.before = r.drawing
          else if (this.removing.has(k)) this.latest.set(k, r.drawing)
          else this.set(p.id, k, r.drawing)
          this.rebase(r.drawing, before.updated)
          this.push(p.scope, { t: 'update', id: p.id, before, after: r.drawing })
        } else {
          // 書いている間の編集も捨てる（そのタイマーも止める。残すと、あとの編集を早く書いてしまう）
          const again = this.pending.get(k)
          if (again?.timer) clearTimeout(again.timer)
          this.pending.delete(k)
          this.conflict(p.id, k, r.current)
        }
      } catch {
        this.set(p.id, k, before)
        this.notify('failed')
      } finally {
        this.busy.set(p.scope, (this.busy.get(p.scope) ?? 1) - 1)
      }
    }
  }
  remove(scope: string, id: string, drawingId: string): Promise<void> {
    // 手元からはすぐ消す（前の書き込みの返事を待たない。create と同じく先に画面へ）
    this.removing.add(drawingId)
    const at = this.pending.get(drawingId)?.last ?? this.find(id, drawingId)
    this.set(id, drawingId, null)
    return this.run(scope, () => this.doRemove(scope, id, drawingId, at)).finally(() => {
      this.removing.delete(drawingId)
      this.latest.delete(drawingId)
    })
  }
  private async doRemove(scope: string, id: string, drawingId: string, at?: Drawing): Promise<void> {
    await this.doFlush(drawingId)
    // 手元からは消してある。書きかけを書いた値か、押したときの図形で Core から消す（読み直しで戻っていれば手元の値）
    const cur = this.find(id, drawingId) ?? this.latest.get(drawingId) ?? at
    if (!cur) return
    this.set(id, drawingId, null)
    try {
      const r = await this.io.remove(id, drawingId, cur.updated)
      if (r.ok) this.push(scope, { t: 'remove', id, d: r.drawing })
      else this.conflict(id, drawingId, r.current)
    } catch {
      this.set(id, drawingId, cur)
      this.notify('failed')
    }
  }
  clear(scope: string, id: string): Promise<void> {
    return this.run(scope, () => this.doClear(scope, id))
  }
  private async doClear(scope: string, id: string): Promise<void> {
    for (const [k, p] of [...this.pending]) if (p.id === id) await this.doFlush(k)
    try {
      const list = await this.io.clear(id)
      const gone = new Set(list.map((d) => d.id))
      this.store.put(
        id,
        this.store.list(id).filter((d) => !gone.has(d.id)),
      )
      if (list.length) this.push(scope, { t: 'clear', id, list })
    } catch {
      this.notify('failed')
    }
  }

  /** Core から読み直した値を手元に入れる（編集中・作っている途中の図形は手元の値を残す） */
  merge(id: string, fresh: readonly Drawing[]): void {
    const keep = (k: string) => this.pending.has(k) || this.creating.has(k)
    const out = fresh.filter((d) => !this.removing.has(d.id)).map((d) => (keep(d.id) ? (this.find(id, d.id) ?? d) : d))
    for (const d of this.store.list(id)) if (keep(d.id) && !out.some((x) => x.id === d.id)) out.push(d)
    this.store.put(id, out)
  }

  undo(scope: string): Promise<boolean> {
    return this.run(scope, () => this.replay(scope, false))
  }
  redo(scope: string): Promise<boolean> {
    return this.run(scope, () => this.replay(scope, true))
  }
  private async replay(scope: string, redo: boolean): Promise<boolean> {
    await this.doFlush()
    const h = this.hist.get(scope)
    const op = (redo ? h?.redo : h?.undo)?.pop()
    if (!h || !op) return false
    const next = await this.apply(op, redo)
    if (next) (redo ? h.undo : h.redo).push(next)
    return true
  }
  /** 操作を戻す（forward=false）・やり直す（true）。ほかの窓で変わっていて出来なければ知らせて null */
  private async apply(op: Op, forward: boolean): Promise<Op | null> {
    try {
      const add = async (d: Drawing): Promise<Drawing | null> => {
        const r = await this.io.create(op.id, d)
        if (!r.ok) return null
        this.set(op.id, d.id, r.drawing)
        this.rebase(r.drawing, d.updated)
        return r.drawing
      }
      const drop = async (d: Drawing): Promise<boolean> => {
        const r = await this.io.remove(op.id, d.id, d.updated)
        if (!r.ok) {
          this.conflict(op.id, d.id, r.current)
          return false
        }
        this.set(op.id, d.id, null)
        return true
      }
      if (op.t === 'create' || op.t === 'remove') {
        // 作るの取り消し・消すのやり直しは消す。作るのやり直し・消すの取り消しは足し直す
        if ((op.t === 'create') !== forward) return (await drop(op.d)) ? op : null
        const d = await add(op.d)
        return d ? { ...op, d } : null
      }
      if (op.t === 'update') {
        const [from, to] = forward ? [op.before, op.after] : [op.after, op.before]
        const r = await this.io.update(op.id, { ...to, created: from.created }, from.updated)
        if (!r.ok) {
          this.conflict(op.id, to.id, r.current)
          return null
        }
        this.set(op.id, to.id, r.drawing)
        this.rebase(r.drawing, from.updated)
        return forward ? { ...op, after: r.drawing } : { ...op, before: r.drawing }
      }
      // すべて消すの取り消しは 1 本ずつ足し直す。やり直しはまた消す
      if (!forward) {
        const back: Drawing[] = []
        for (const d of op.list) {
          const x = await add(d)
          if (x) back.push(x)
        }
        if (back.length < op.list.length) this.notify('conflict')
        return back.length ? { ...op, list: back } : null
      }
      const list = await this.io.clear(op.id)
      const gone = new Set(list.map((d) => d.id))
      this.store.put(
        op.id,
        this.store.list(op.id).filter((d) => !gone.has(d.id)),
      )
      return list.length ? { ...op, list } : null
    } catch {
      this.notify('failed')
      return null
    }
  }
}
