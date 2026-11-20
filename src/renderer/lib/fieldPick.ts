// 条件を選ぶダイアログ（overlays/FieldPicker.svelte）の判定: 当たり方と単位。画面は描くだけ（docs/testing.md）
import type { FieldDef } from '@shared/fields'
import { normText as norm } from './highlight'

/** 3: 名前と同じ / 2: 名前・別名に含む（空の語も） / 1: 説明だけに含む / 0: 当たらない */
export function fieldMatch(f: FieldDef, q: string): number {
  if (!q) return 2
  const t0 = norm(q)
  // 名前と同じ（「EPS」で EPS を、別名に EPS を持つ配当性向より先に）
  if (norm(f.label.ja) === t0 || norm(f.label.en) === t0) return 3
  if (norm(`${f.label.ja} ${f.label.en} ${f.alias ?? ''}`).includes(t0)) return 2
  if (norm(`${f.description?.ja ?? ''} ${f.description?.en ?? ''}`).includes(t0)) return 1
  return 0
}
/** 単位（登録表に無ければ種類から） */
export function fieldUnit(f: FieldDef, lang: 'ja' | 'en'): string {
  if (f.unit) return f.unit[lang]
  if (f.type === 'percent') return '%'
  if (f.type === 'ratio') return lang === 'ja' ? '倍' : 'x'
  return ''
}
