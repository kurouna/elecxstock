// チャート（ChartView.svelte）の凡例の足と、作り直したときの表示期間（§7, FR-C1・C3）。.svelte に判定を書かないため、ここに出す（L1）

/**
 * 十字線の日付 → 凡例に出す足の番号。足に無い日付（一目の先行スパンが描く 26 本先の未来）や十字線が無いときは null
 * （凡例は最後の足に戻る）。indexOf の -1 をそのまま使うと凡例が壊れる
 */
export function legendIndex(time: string | null | undefined, times: readonly string[]): number | null {
  if (!time) return null
  const i = times.indexOf(time)
  return i >= 0 ? i : null
}

/** 凡例に出す足（範囲の外・null は最後の足。足が無ければ null） */
export function legendBar(idx: number | null, n: number): number | null {
  if (n < 1) return null
  return idx != null && Number.isInteger(idx) && idx >= 0 && idx < n ? idx : n - 1
}

export interface LogicalRange {
  from: number
  to: number
}

/**
 * 作り直したあとの表示期間（足の論理番号）。同じ時間軸の作り直し（指標・調整・データの更新）なら前の表示を保つ。
 * 時間軸が替わった（D/W/M）・初めて描くときは、末尾から show 本（右に 3 本の余白）。足の本数が違う時間軸の論理番号を
 * 持ち越すと、未来の空白や最古の足へ飛ぶ。同じ時間軸でも、前の表示が足の範囲（右の余白を含む）にまったく掛からない
 * （保存期間を短くして足が減った）ときは末尾から。銘柄を替えたときは ChartView が作り直される（Chart.svelte の {#key id}）
 */
export function rangeAfterBuild(
  keep: LogicalRange | null | undefined,
  builtTf: string | null,
  tf: string,
  n: number,
  show: number,
): LogicalRange {
  if (keep && builtTf === tf && keep.from < n + 3 && keep.to > 0) return { from: keep.from, to: keep.to }
  return { from: Math.max(0, n - show), to: n + 3 }
}

/**
 * 次のフレームに 1 つだけ走らせる（作り直したあとの表示期間・段の位置）。続けて頼むと前のものは走らない。
 * 0 キー・期間の変更で表示期間を置くときと、閉じるときに取りやめる（古い表示期間で上書きしない・閉じたあとに触らない）
 */
export class FrameSlot {
  private handle = 0
  constructor(
    private raf: (f: () => void) => number = (f) => requestAnimationFrame(f),
    private caf: (h: number) => void = (h) => cancelAnimationFrame(h),
  ) {}
  run(f: () => void): void {
    this.cancel()
    const h = this.raf(() => {
      if (this.handle === h) this.handle = 0
      f()
    })
    this.handle = h
  }
  cancel(): void {
    if (this.handle) this.caf(this.handle)
    this.handle = 0
  }
}
