// タブの下線を 1 本にして、選んだタブへ滑らせる Svelte のアクション（FR-V9。docs/design-motion.md）。
// 使い方: 入れ物（position: relative）の中に <span class="ink" use:ink={{ key, pick }}></span> を置く。
// key（選んだタブ）が変わったときだけ滑らせ、ボタンの幅が変わって測り直すとき（名前・言語・省略 FR-L13・文字の読み込み）は滑らせない。
// 測る値は offsetLeft・offsetWidth（倍率が掛かっていない px）なので、style の px とそろう（lib/pointer.ts）。

import { inkSpan, motionMs } from './paneMotion'

export interface InkParams {
  /** 選んだタブを表す値。変わったら滑らせる */
  key: string
  /** 下線を引くボタン（マイレイアウトはタブと ▾ の 2 つ） */
  pick: () => HTMLElement[]
  /** 持ち主（使い回されたドロワーが別のタブのドロワーに替わったら、滑らせずに置き直す） */
  group?: string
  /** false のときは滑らせない（ドロワーが閉じている・開く動きの途中） */
  slide?: boolean
}

/** 見えない環境（テスト）でも動くように、必要なものだけを受け取る */
export interface InkEnv {
  observe: (cb: () => void) => { observe: (el: Element) => void; disconnect: () => void }
  now: () => number
  /** 滑る時間（--motion-tab） */
  duration: () => number
  defer: (f: () => void) => void
}

const browserEnv = (): InkEnv => ({
  observe: (cb) => new ResizeObserver(cb),
  now: () => performance.now(),
  duration: () => motionMs(getComputedStyle(document.documentElement).getPropertyValue('--motion-tab').trim()),
  defer: (f) => queueMicrotask(f),
})

export function ink(bar: HTMLElement, params: InkParams, env: InkEnv = browserEnv()) {
  let p = params
  let last = ''
  let slidingUntil = 0
  const place = (slide: boolean) => {
    const span = inkSpan(p.pick().map((e) => ({ left: e.offsetLeft, width: e.offsetWidth })))
    if (!span) {
      // 隠すときは滑りも消す（また出たときに前の滑りが残らない）
      bar.style.visibility = 'hidden'
      bar.classList.toggle('slide', false)
      slidingUntil = 0
      last = ''
      return
    }
    const at = `${span.left}:${span.width}`
    if (at === last) return
    // 初めて出すときは滑らせない（左端から飛んでこない）。滑っている途中に測り直すとき（文字の読み込みなど）は滑りを保つ（途中で飛ばない）
    const sliding = (slide && last !== '') || env.now() < slidingUntil
    if (slide && last !== '') slidingUntil = env.now() + env.duration()
    bar.classList.toggle('slide', sliding)
    bar.style.transform = `translateX(${span.left}px)`
    bar.style.width = `${span.width}px`
    // 親（閉じたドロワー）の visibility: hidden を打ち消さないよう、見せるときは inline の指定を外すだけにする
    bar.style.visibility = ''
    last = at
  }
  const ro = env.observe(() => place(false))
  // 子は増えたり作り直されたりする（ドロワーのタブ・マイレイアウトの ▾）ので、測るたびに見直す（同じ要素は二重に見ない）
  const watch = () => {
    const box = bar.parentElement
    if (!box) return
    ro.observe(box)
    for (const c of box.children) if (c !== bar) ro.observe(c)
  }
  watch()
  place(false)
  // 同じフラッシュで何度か update が来ても、測るのは最後の値で 1 回だけ。滑らせるかは、最後に置いたとき（placed）と比べて
  // 測る時点で決める（届いた順番によらない）。まとめている間に一度でも持ち主が替わった・閉じていたら滑らせない
  let placedKey = params.key
  let placedGroup = params.group ?? ''
  let resetInBatch = false
  let scheduled = false
  return {
    update(next: InkParams) {
      if ((next.group ?? '') !== (p.group ?? '') || next.slide === false) {
        // 持ち主が替わった・閉じている: 滑っている途中でも滑らせない（滑りを保つ時間も捨てる）
        resetInBatch = true
        slidingUntil = 0
      }
      p = next
      if (scheduled) return
      scheduled = true
      // aria-current などが書き換わったあとに測る
      env.defer(() => {
        scheduled = false
        const group = p.group ?? ''
        const slide = !resetInBatch && p.slide !== false && p.key !== placedKey && group === placedGroup
        resetInBatch = false
        placedKey = p.key
        placedGroup = group
        watch()
        place(slide)
      })
    },
    destroy() {
      ro.disconnect()
    },
  }
}
