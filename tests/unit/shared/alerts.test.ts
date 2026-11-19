// アラートの判定（FR-AL1・AL3・AL4・AL8・NFR-AL1。design-alerts.md §3）。値はすべて架空
import { decide, decideScreen, type EvalInput, evaluateAlert } from '@core/alerts'
import { adjustedConditions, alertConditionOk, defaultAlertCondition, distanceOf, splitFactorAfter } from '@shared/alerts'
import { FIELD_BY_ID } from '@shared/fields'
import type { Alert, Instrument, MetricsRow } from '@shared/types'
import { describe, expect, it } from 'vitest'

const ins: Instrument = {
  id: 'JP:7203',
  code: '7203',
  nameJa: '架空自動車',
  nameEn: 'Fictitious Motors',
  market: 'P',
  kind: 'stock',
  sectorJa: '輸送用機器',
  sectorEn: 'Transportation',
  status: 'active',
  userAdded: false,
} as unknown as Instrument
const row = (o: Partial<MetricsRow> = {}): MetricsRow =>
  ({
    id: 'JP:7203',
    asOf: '2026-11-13',
    provisional: false,
    gapSuspect: false,
    anomaly: false,
    close: 3000,
    ma75: 3100,
    yieldTrailing: 4.2,
    ...o,
  }) as MetricsRow
const alert = (o: Partial<Alert> = {}): Alert => ({
  id: 'a1',
  target: { kind: 'symbol', id: 'JP:7203' },
  conditions: [{ field: 'price.close', op: '<=', value: 2900 }],
  basis: '2026-11-01',
  repeat: true,
  enabled: true,
  created: '2026-11-01T00:00:00Z',
  ...o,
})
const input = (o: Partial<EvalInput> = {}): EvalInput => ({
  instrument: ins,
  metrics: row(),
  holdings: undefined,
  splits: [],
  loading: false,
  lastSession: '2026-11-13',
  ...o,
})
const NOW = '2026-11-14T08:00:00Z'

describe('使える条件（FR-AL1）', () => {
  it('数値の市場の指標と保有の損益率、>= <= と相対条件だけ', () => {
    expect(alertConditionOk({ field: 'price.close', op: '<=', value: 3000 })).toBe(true)
    expect(alertConditionOk({ field: 'price.close', op: '<=', value: 0, ref: 'price.ma75' })).toBe(true)
    expect(alertConditionOk({ field: 'income.yield', op: '>=', value: 5 })).toBe(true)
    expect(alertConditionOk({ field: 'holding.pnlPct', op: '<=', value: -10 })).toBe(true)
    expect(alertConditionOk({ field: 'attr.market', op: 'in', value: ['R'] })).toBe(false)
    expect(alertConditionOk({ field: 'user.favorite', op: '=', value: true })).toBe(false)
    expect(alertConditionOk({ field: 'price.close', op: '<=', value: 3000, or: true })).toBe(false)
    expect(alertConditionOk({ field: 'price.close', op: '<=', value: 3000, includeMissing: true })).toBe(false)
  })
})

describe('分割・併合の換算（§3.3）', () => {
  it('基準日より後の分割の比率で、価格のしきい値を割る。比率の指標と相対条件は換算しない', () => {
    const splits = [
      { date: '2026-10-01', ratio: 2 }, // 基準日より前
      { date: '2026-11-10', ratio: 5 },
    ]
    expect(splitFactorAfter('2026-11-01', splits)).toBe(5)
    const a = alert({
      conditions: [
        { field: 'price.close', op: '<=', value: 15000 },
        { field: 'income.yield', op: '>=', value: 4 },
        { field: 'price.close', op: '<=', value: 0, ref: 'price.ma75' },
      ],
    })
    const adj = adjustedConditions(a, splits)!
    expect(adj[0]!.value).toBe(3000)
    expect(adj[1]!.value).toBe(4)
    expect(adj[2]!.value).toBe(0)
    expect(adjustedConditions(a, [{ date: '2026-10-01', ratio: 2 }])).toBeNull()
  })
  it('換算したしきい値で判定する（分割で鳴り損ねない・誤って鳴らない）', () => {
    const a = alert({ conditions: [{ field: 'price.close', op: '<=', value: 15000 }] })
    const r = evaluateAlert(a, input({ metrics: row({ close: 2950 }), splits: [{ date: '2026-11-10', ratio: 5 }] }))
    expect(r.met).toBe(true)
    expect(r.splitAdjusted).toBe(true)
    const r2 = evaluateAlert(a, input({ metrics: row({ close: 3100 }), splits: [{ date: '2026-11-10', ratio: 5 }] }))
    expect(r2.met).toBe(false)
  })
})

describe('判定できないとき（FR-AL3）', () => {
  it('取り込み中・銘柄が無い・廃止・指標が無い・分割の疑い・古い基準日・保有が無い', () => {
    expect(evaluateAlert(alert(), input({ loading: true })).invalid).toBe('loading')
    expect(evaluateAlert(alert(), input({ instrument: undefined })).invalid).toBe('missing')
    expect(evaluateAlert(alert(), input({ instrument: { ...ins, status: 'delisted' } as Instrument })).invalid).toBe('delisted')
    expect(evaluateAlert(alert(), input({ metrics: undefined })).invalid).toBe('missing')
    expect(evaluateAlert(alert(), input({ metrics: row({ gapSuspect: true }) })).invalid).toBe('suspect')
    expect(evaluateAlert(alert(), input({ metrics: row({ anomaly: true }) })).invalid).toBe('suspect')
    expect(evaluateAlert(alert(), input({ metrics: row({ asOf: '2026-11-12' }) })).invalid).toBe('stale')
    const pnl = alert({ conditions: [{ field: 'holding.pnlPct', op: '<=', value: -10 }] })
    expect(evaluateAlert(pnl, input()).invalid).toBe('noHoldings')
    const bad = alert({ conditions: [{ field: 'attr.market', op: 'in', value: ['R'] }] })
    expect(evaluateAlert(bad, input()).invalid).toBe('condition')
  })
  it('仮の足で判定したら provisional を付ける（NFR-AL2）', () => {
    const r = evaluateAlert(alert(), input({ metrics: row({ close: 2800, provisional: true }) }))
    expect(r).toMatchObject({ met: true, provisional: true, asOf: '2026-11-13' })
  })
  it('保有の損益率は保有から計算する', () => {
    const pnl = alert({ conditions: [{ field: 'holding.pnlPct', op: '<=', value: -10 }] })
    const holdings = new Map([['JP:7203', { qty: 100, cost: 350000 }]]) // 取得 3,500 → 3,000 で −14.3%
    expect(evaluateAlert(pnl, input({ holdings })).met).toBe(true)
  })
})

describe('鳴り方（FR-AL4。§3.1 の表）', () => {
  const ok = (met: boolean, asOf = '2026-11-13') => ({ met, asOf, conditions: [], splitAdjusted: false, values: {}, provisional: false })
  it('最初の判定・met が null（作った・直した・再開した直後）は基準を取るだけで鳴らない', () => {
    expect(decide(undefined, ok(true), NOW)).toEqual({ state: { met: true, asOf: '2026-11-13' }, fire: false })
    expect(decide({ met: null }, ok(true), NOW).fire).toBe(false)
  })
  it('成り立たない → 成り立つ で 1 回鳴り、成り立ち続ける間は鳴らない', () => {
    const s1 = decide({ met: false, asOf: '2026-11-12' }, ok(true), NOW)
    expect(s1.fire).toBe(true)
    expect(s1.state.lastFired).toBe(NOW)
    expect(decide(s1.state, ok(true, '2026-11-14'), NOW).fire).toBe(false)
    const off = decide(s1.state, ok(false, '2026-11-15'), NOW)
    expect(off.fire).toBe(false)
    expect(decide(off.state, ok(true, '2026-11-16'), NOW).fire).toBe(true)
  })
  it('同じ基準日では判定し直さない（場中の F5 で PER などが動いても）', () => {
    const prev = { met: false, asOf: '2026-11-13' }
    expect(decide(prev, ok(true, '2026-11-13'), NOW)).toEqual({ state: prev, fire: false })
  })
  it('判定できないときは met を変えずに理由を書く', () => {
    const r = decide({ met: false, asOf: '2026-11-12' }, { ...ok(false), met: null, invalid: 'stale' }, NOW)
    expect(r).toEqual({ state: { met: false, asOf: '2026-11-12', invalid: 'stale' }, fire: false })
  })
})

describe('条件までの距離（FR-AL8）', () => {
  it('価格・相対条件は「あと何 %」、比率の指標は「あと何ポイント」。いちばん遠いもの', () => {
    const m = row({ close: 3000, ma75: 3100, yieldTrailing: 4.2 })
    expect(distanceOf([{ field: 'price.close', op: '<=', value: 2850 }], m, undefined, 'JP:7203')).toEqual({
      kind: 'pct',
      value: expect.closeTo(-5, 5),
    })
    expect(distanceOf([{ field: 'income.yield', op: '>=', value: 5 }], m, undefined, 'JP:7203')).toEqual({
      kind: 'pt',
      value: expect.closeTo(0.8, 5),
    })
    // 終値 ≥ 75 日線 +2%: 相手は 3,162 → あと +5.4%
    expect(distanceOf([{ field: 'price.close', op: '>=', value: 2, ref: 'price.ma75' }], m, undefined, 'JP:7203')!.value).toBeCloseTo(
      5.4,
      1,
    )
    // 成り立っていれば null
    expect(distanceOf([{ field: 'price.close', op: '<=', value: 3200 }], m, undefined, 'JP:7203')).toBeNull()
  })
  it('負・0 になる 1 株あたりの金額（EPS・BPS）は %ではなく円の差（今の値が 0 以下か、しきい値が負なら）', () => {
    // EPS −100 → 目標 110: % にすると −210%（向きが逆）、EPS 0 だと 0%（達成済みに見える）。差は円（pt ではない）
    expect(distanceOf([{ field: 'value.eps', op: '>=', value: 110 }], row({ eps: -100 }), undefined, 'JP:7203')).toEqual({
      kind: 'yen',
      value: 210,
    })
    expect(distanceOf([{ field: 'value.eps', op: '>=', value: 50 }], row({ eps: 0 }), undefined, 'JP:7203')).toEqual({
      kind: 'yen',
      value: 50,
    })
    expect(distanceOf([{ field: 'value.bps', op: '<=', value: -10 }], row({ bps: 40 }), undefined, 'JP:7203')).toEqual({
      kind: 'yen',
      value: -50,
    })
    // どちらも正なら今までどおり %
    expect(distanceOf([{ field: 'value.eps', op: '>=', value: 110 }], row({ eps: 100 }), undefined, 'JP:7203')).toEqual({
      kind: 'pct',
      value: expect.closeTo(10, 5),
    })
  })
  it('今の値が正でしきい値が 0 なら %（1 株配当 100 → ≤ 0 は −100%）', () => {
    expect(distanceOf([{ field: 'income.div12', op: '<=', value: 0 }], row({ div12: 100 }), undefined, 'JP:7203')).toEqual({
      kind: 'pct',
      value: -100,
    })
  })
  it('率の指標の差は今までどおりポイント（EPS などの円の差と混ぜない）', () => {
    expect(distanceOf([{ field: 'income.yield', op: '>=', value: 1 }], row({ yieldTrailing: -0.5 }), undefined, 'JP:7203')).toEqual({
      kind: 'pt',
      value: 1.5,
    })
  })
})

describe('アラートの既定のしきい値（FR-AL7）', () => {
  const st = (v: number) => (Math.abs(v) >= 1 ? Math.max(1, 10 ** (Math.floor(Math.log10(Math.abs(v))) - 2)) : 1)
  it('1 株あたりの金額は今の値の 5% 下（≤）。負・0 でも作った直後に成り立たない', () => {
    for (const now of [3000, 512.3, -100, -0.4, 0, 0.3]) {
      const c = defaultAlertCondition('price.close', now, st)
      expect(c.op).toBe('<=')
      expect(Number(c.value)).toBeLessThan(now)
    }
    expect(defaultAlertCondition('price.close', 3000, st).value).toBe(2850)
    expect(defaultAlertCondition('value.eps', -100, st).value).toBe(-105)
    expect(defaultAlertCondition('value.eps', 0, st).value).toBe(-1)
  })
  it('ほかの指標は今の値（≥）、今の値が無ければ登録表の既定', () => {
    expect(defaultAlertCondition('income.yield', 4.23, st)).toEqual({ field: 'income.yield', op: '>=', value: 4.2 })
    expect(defaultAlertCondition('price.close', null, st)).toEqual({
      field: 'price.close',
      op: '<=',
      value: FIELD_BY_ID.get('price.close')!.default,
    })
  })
})

describe('速さ（NFR-AL1）', () => {
  it('500 件を 100ms 以内（指標の読み込みを除く）', () => {
    const list = Array.from({ length: 500 }, (_, i) =>
      alert({ id: `a${i}`, conditions: [{ field: 'price.close', op: '<=', value: 2000 + i }] }),
    )
    const t0 = performance.now()
    let prev = {}
    for (const a of list) prev = decide(undefined, evaluateAlert(a, input()), NOW)
    expect(prev).toBeTruthy()
    expect(performance.now() - t0).toBeLessThan(100)
  })
})

describe('スクリーンのアラート（FR-AL2）', () => {
  const ev = (ids: string[], asOf = '2026-11-13', suspect: string[] = []) => ({ ids, suspect: new Set(suspect), asOf })
  it('基準が無ければ結果を覚えるだけ。次の基準日に新しく入った銘柄を知らせ、外れた銘柄は知らせない', () => {
    const s0 = decideScreen(undefined, ev(['JP:1', 'JP:2']), NOW)
    expect(s0.news).toEqual([])
    expect(s0.state.members).toEqual(['JP:1', 'JP:2'])
    const s1 = decideScreen(s0.state, ev(['JP:2', 'JP:3'], '2026-11-16'), NOW)
    expect(s1.news).toEqual(['JP:3'])
    expect(s1.state).toMatchObject({ members: ['JP:2', 'JP:3'], lastFired: NOW })
  })
  it('同じ基準日では判定し直さない。分割の疑いの銘柄は知らせず、覚えもしない', () => {
    const s0 = decideScreen(undefined, ev(['JP:1']), NOW).state
    expect(decideScreen(s0, ev(['JP:1', 'JP:9']), NOW).news).toEqual([])
    const s1 = decideScreen(s0, ev(['JP:1', 'JP:9'], '2026-11-16', ['JP:9']), NOW)
    expect(s1.news).toEqual([])
    expect(s1.state.members).toEqual(['JP:1'])
    // 値が直ってから入っていれば知らせる
    expect(decideScreen(s1.state, ev(['JP:1', 'JP:9'], '2026-11-17'), NOW).news).toEqual(['JP:9'])
  })
  it('判定できないときは前の結果を残す', () => {
    const s0 = decideScreen(undefined, ev(['JP:1']), NOW).state
    const r = decideScreen(s0, { ids: [], suspect: new Set(), invalid: 'noScreen' }, NOW)
    expect(r.state).toMatchObject({ members: ['JP:1'], invalid: 'noScreen' })
    expect(r.news).toEqual([])
  })
})
