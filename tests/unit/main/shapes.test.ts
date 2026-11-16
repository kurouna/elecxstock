// フリー N の初期の形の許可リスト（マルチモニタ・FR-L14）: 知らない値は捨てて前回の配置で開く
import { describe, expect, it } from 'vitest'
import { freeShapeArg } from '../../../src/main/shapes'

describe('フリー N の初期の形（FR-L7, FR-L14）', () => {
  it('決まった形と、マイレイアウトのページ（page:<ID>）だけを通す', () => {
    for (const s of ['grid', 'quad', 'detail', 'empty', 'page:p1a2b', 'page:free', 'page:l-x_9']) expect(freeShapeArg(s)).toBe(s)
  })
  it('前回の配置（last）・知らない値・長すぎる ID・記号は前回の配置にする', () => {
    for (const s of ['last', 'nope', '', 'page:', `page:${'x'.repeat(41)}`, 'page:a&b', 'page:a/b', 3, null, undefined])
      expect(freeShapeArg(s)).toBeUndefined()
  })
})
