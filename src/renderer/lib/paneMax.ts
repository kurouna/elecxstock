// ペインの最大化と戻す（FR-L3）。動き（FR-V9）は FLIP を Web Animations で: 前の矩形を測る → 状態を変えて DOM を更新 →
// 後の矩形を測る → 前の矩形に見える transform から none へ。終わりは必ず本当のレイアウトなので、後始末の状態を持たない。
// 時間は app.css のトークン（--motion-max・--motion-restore）を読み、動きを減らすとき（0ms）は飛ばさない。docs/design-motion.md

import { flushSync } from 'svelte'
import { app } from '../stores/app.svelte'
import { type Box, enterFrames, flipFrom, flipTransform, motionMs } from './paneMotion'
import { paneSelector } from './panes'
import { rootZoom } from './pointer'

const paneEl = (id: string | null): HTMLElement | null => (id ? document.querySelector<HTMLElement>(paneSelector(id)) : null)
const box = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * 最大化の動きの ID。transform だけの動き（合成スレッドで動く）と、前に出す・影の動き（一定の値）を分ける。
 * 1 つの効果に z-index・box-shadow を混ぜると、Chromium は効果ごとメインスレッドで動かし、チャートの描き直しと同じフレームでカクつく
 */
export const MAX_IDS = ['pane-max', 'pane-max-lift'] as const

/** 飛んでいる途中の動きを止める（止める前に測れば、今の見た目の位置から折り返せる） */
function stop(el: HTMLElement | null): void {
  for (const a of el?.getAnimations?.() ?? []) if ((MAX_IDS as readonly string[]).includes(a.id)) a.cancel()
}

/** 飛んでいる間の影。フォーカスの枠（.pane.focused の box-shadow）を消さないよう、今の枠に足す */
export function liftShadow(current: string, shadow: string): string {
  const s = shadow || 'none'
  if (!current || current === 'none') return s
  return s === 'none' ? current : `${current}, ${s}`
}

/** 最大化するペインを替える（null で戻す）。動かせないとき（動きを減らす・測れない）は今までどおり一度で切り替える。
 * キー・クリックのイベントから呼ぶ（中で flushSync するので、$effect の中からは呼ばない） */
export function setMaximized(next: string | null): void {
  const prev = app.maximized
  if (prev === next) return
  // 飛ぶのは、広げるときは広げるペイン、戻すときは戻るペイン。別のペインから移るときは前のペインは一度で戻す
  const el = paneEl(next ?? prev)
  const ms = motionMs(token(next ? '--motion-max' : '--motion-restore'))
  // タブの中身が入ってくる動き（transform）の途中だと fixed の基準がずれるので、先に終わらせる
  for (const a of document.getAnimations?.() ?? []) if (a.id === 'view-in') a.finish()
  const before = ms > 0 && el?.isConnected && typeof el.animate === 'function' ? box(el) : null
  stop(el)
  stop(paneEl(prev))
  const ring = before ? getComputedStyle(el!).boxShadow : ''
  app.maximized = next
  if (!before || !el) return
  flushSync()
  // 木が変わってペインの要素が作り直された（例: 最大化したまま別の向きに分割して、新しい分割で包まれた）ときは、新しい要素を飛ばす
  const target = el.isConnected ? el : paneEl(next ?? prev)
  if (!target?.isConnected || typeof target.animate !== 'function') return
  const f = flipFrom(before, box(target), rootZoom())
  if (!f) return
  const timing = { duration: ms, easing: token('--ease-out') || 'ease-out' }
  target.animate([{ transform: flipTransform(f) }, { transform: 'none' }], { ...timing, id: 'pane-max' })
  // 飛んでいる間だけ前に出し、影で下のペインと見分ける（一定の値。影は動かさない）
  const lift = { zIndex: 31, boxShadow: liftShadow(ring, token('--shadow')) }
  target.animate([lift, lift], { ...timing, id: 'pane-max-lift' })
}

/** 動きなしで戻す（別のペインを見せるとき。ドロワーの開閉と重ねない） */
export function clearMaximized(): void {
  stop(paneEl(app.maximized))
  app.maximized = null
}

/**
 * タブ・ドロワーのタブを替えたとき、新しい中身を入れる（FR-V9。--motion-view・--ease-view）。Web Animations で一度だけ再生し、終わったら何も残さない。
 * 動きを減らすとき（0ms）・要素が無いときは何もしない。dir は slideDir の向き。
 * 最大化は中身の動きの途中なら finish() で先に終わらせる（transform の途中は fixed の基準がずれる。cancel でも見た目は同じで、終わった状態に置くことを示すため finish）
 */
export function playIn(el: Element | null | undefined, dir: -1 | 0 | 1, scope: Element | null | undefined = el): void {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return
  const ms = motionMs(token('--motion-view'))
  if (!ms) return
  // 前の動きの途中（連打）なら薄くし直さず、滑らせるだけにする（作業域が明滅しない）
  // scope は前の動きを探す範囲（ドロワーは前のタブの slot も見る）
  const running = (scope ?? el).getAnimations({ subtree: true }).filter((a) => a.id === 'view-in')
  for (const a of running) a.cancel()
  el.animate(enterFrames(dir, running.length === 0), { id: 'view-in', duration: ms, easing: token('--ease-view') || 'ease-out' })
}

/** キーの操作でドロワーのタブを替えるときの向き（Ctrl+Tab は 1、Ctrl+Shift+Tab は -1）。Dock が一度だけ受け取る */
let hint: -1 | 0 | 1 = 0
export function setTabHint(dir: -1 | 1): void {
  hint = dir
}
export function takeTabHint(): -1 | 0 | 1 {
  const h = hint
  hint = 0
  return h
}
