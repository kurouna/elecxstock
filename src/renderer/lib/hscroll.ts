// 横に溢れるタブの帯（スクロールバーを隠している）を、マウスのホイールでも横に送る（FR-KB4 の逆: キーでできることをマウスでも）。
// ウォッチリスト・マーケット一覧・騰落・株価ボードのタブで使う（use:hscroll）

/** ホイールの量のうち、横に送る量。縦の回転が主なら縦の量を横に使う。横の回転（チルト・トラックパッド）が主なら送らない（ブラウザに任せる） */
export function wheelToX(deltaX: number, deltaY: number): number | null {
  return Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : null
}

/** Svelte のアクション。帯が溢れているときだけ、縦のホイールを横の送りにする（溢れていなければ何もしない） */
export function hscroll(node: HTMLElement): { destroy: () => void } {
  const on = (e: WheelEvent) => {
    if (node.scrollWidth <= node.clientWidth) return
    const d = wheelToX(e.deltaX, e.deltaY)
    if (d == null) return
    node.scrollLeft += d
    e.preventDefault()
  }
  node.addEventListener('wheel', on, { passive: false })
  return { destroy: () => node.removeEventListener('wheel', on) }
}
