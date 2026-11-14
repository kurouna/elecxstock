// テストのための時刻（ELECXSTOCK_NOW。docs/testing.md）。スタブのプロバイダのときだけ使う（実際のデータの取得では時刻をずらさない）。
// Date を止めずに、基準日時からのずれで進める（タイマー・ジョブの待ちはそのまま動く）。
// ずれは main が 1 回だけ計算し、Core（ELECXSTOCK_CLOCK_OFFSET）と renderer（preload への引数）に同じ値を渡す。

/** 全テストの基準日時（平日の大引けのあと） */
export const TEST_NOW = '2026-11-13T18:00:00+09:00'

type Env = { ELECXSTOCK_PROVIDER?: string; ELECXSTOCK_NOW?: string; ELECXSTOCK_CLOCK_OFFSET?: string }

/** 時刻のずれ（ms）。スタブのプロバイダのときだけ。渡されたずれがあればそれを、無ければ ELECXSTOCK_NOW から計算する */
export function clockOffsetFrom(env: Env, now = Date.now()): number | null {
  if (env.ELECXSTOCK_PROVIDER !== 'stub') return null
  const given = Number(env.ELECXSTOCK_CLOCK_OFFSET)
  if (env.ELECXSTOCK_CLOCK_OFFSET && Number.isFinite(given)) return given
  const t = env.ELECXSTOCK_NOW ? Date.parse(env.ELECXSTOCK_NOW) : Number.NaN
  return Number.isFinite(t) ? t - now : null
}

/**
 * このプロセスの Date を `offset` ms ずらす。2 回目以降は何もしない。
 * 引数なしの `new Date()`・`Date.now()`・`Date()`（文字列）だけをずらし、日時を渡した `new Date(…)`・`Date.parse` はそのまま
 */
export function shiftClock(offset: number): void {
  const g = globalThis as { Date: DateConstructor; __elecxstockClock?: boolean }
  if (g.__elecxstockClock || !Number.isFinite(offset)) return
  const Real = g.Date
  const now = () => Real.now() + offset
  g.Date = new Proxy(Real, {
    construct: (t, a, nt) => Reflect.construct(t, a.length === 0 ? [now()] : a, nt),
    apply: () => new Real(now()).toString(),
    get: (t, p, r) => (p === 'now' ? now : Reflect.get(t, p, r)),
  })
  g.__elecxstockClock = true
}
