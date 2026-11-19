// チャートの画像の保存（FR-C11）: 設定の「チャート」で ON にしたときだけ使える（既定 OFF。データは Yahoo Finance なので個人で使う範囲）。
// 見出しのボタン・S キー・「⋯」の項目から呼ぶ。Lightweight Charts の takeScreenshot は凡例（DOM）を含まないので、
// 銘柄・時間軸・見えている期間の 1 行を上に描き足してから PNG にする

/** 見出しの 1 行の高さ（CSS ピクセル。画像では倍率を掛ける） */
export const HEADER_PX = 28

/** 保存の既定のファイル名。例: elecxstock-8306-D-2026-11-16.png（ファイル名に使えない文字は _ にする） */
export function chartImageName(code: string, tf: string, date: string): string {
  return `elecxstock-${code}-${tf}-${date}.png`.replace(/[\\/:*?"<>|\s]/g, '_')
}

/** 画像の上の 1 行の左（銘柄と時間軸）。例: 8306 三菱UFJ · 日足 */
export function chartImageTitle(code: string, name: string, tfLabel: string): string {
  return [`${code} ${name}`.trim(), tfLabel].filter(Boolean).join(' · ')
}

/** 画像の上の 1 行の右（見えている期間）。例: 2025/11/17 – 2026/11/13。分からなければ空 */
export function chartImageRange(from?: string, to?: string): string {
  if (!from || !to) return ''
  return `${from.replaceAll('-', '/')} – ${to.replaceAll('-', '/')}`
}

/**
 * 見えている期間を足の範囲に収める。一目均衡表の先行スパンは最後の足より先まで時間軸を延ばしているので、
 * 右端が見えているとき getVisibleRange の終わりは未来の日付になる（日付は YYYY-MM-DD なので文字列で比べられる）
 */
export function visibleSpan(from: string | undefined, to: string | undefined, time: readonly string[]): { from?: string; to?: string } {
  const first = time[0]
  const last = time[time.length - 1]
  if (!from || !to || !first || !last) return {}
  const clamp = (x: string) => (x < first ? first : x > last ? last : x)
  return { from: clamp(from), to: clamp(to) }
}

/**
 * 見出しの 1 行の左右を、幅に収まるように決める。銘柄（左）を優先し、期間（右）は入らなければ出さない。
 * 期間を出さなくても銘柄が収まらなければ、末尾を … で切る。measure は描く文字の幅（キャンバスの measureText。bold は左の太字）
 */
export function fitHeader(
  title: string,
  range: string,
  width: number,
  gap: number,
  measure: (s: string, bold: boolean) => number,
): { title: string; range: string } {
  const tw = measure(title, true)
  if (range && tw + gap + measure(range, false) <= width) return { title, range }
  if (tw <= width) return { title, range: '' }
  const cs = [...title]
  let lo = 0
  let hi = cs.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(`${cs.slice(0, mid).join('')}…`, true) <= width) lo = mid
    else hi = mid - 1
  }
  return { title: lo > 0 ? `${cs.slice(0, lo).join('')}…` : '', range: '' }
}

export interface ImageStyle {
  bg: string
  fg: string
  muted: string
  line: string
  font: string
  /** チャートのキャンバスの倍率（devicePixelRatio × CSS の zoom。見出しも同じ倍率で描く） */
  scale: number
}

/** チャートのキャンバスの上に見出しの 1 行を足した、新しいキャンバスを作る */
export function composeChartImage(shot: HTMLCanvasElement, title: string, range: string, s: ImageStyle): HTMLCanvasElement {
  const head = Math.round(HEADER_PX * s.scale)
  const out = document.createElement('canvas')
  out.width = shot.width
  out.height = shot.height + head
  const g = out.getContext('2d')
  if (!g) return shot
  g.fillStyle = s.bg
  g.fillRect(0, 0, out.width, out.height)
  g.textBaseline = 'middle'
  const pad = Math.round(8 * s.scale)
  const bold = `600 ${Math.round(13 * s.scale)}px ${s.font}`
  const thin = `${Math.round(11 * s.scale)}px ${s.font}`
  const fit = fitHeader(title, range, out.width - pad * 2, Math.round(16 * s.scale), (x, b) => {
    g.font = b ? bold : thin
    return g.measureText(x).width
  })
  g.font = bold
  g.fillStyle = s.fg
  g.fillText(fit.title, pad, head / 2)
  if (fit.range) {
    g.font = thin
    g.fillStyle = s.muted
    g.textAlign = 'right'
    g.fillText(fit.range, out.width - pad, head / 2)
  }
  const lw = Math.max(1, Math.round(s.scale))
  g.fillStyle = s.line
  g.fillRect(0, head - lw, out.width, lw)
  g.drawImage(shot, 0, head)
  return out
}

/** キャンバスを PNG のバイト列にする */
export function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    // 読めなかったときも答える（待ち続けると、保存中のままで次の保存ができなくなる）
    c.toBlob(
      (b) =>
        b
          ? b.arrayBuffer().then(
              (x) => resolve(new Uint8Array(x)),
              () => resolve(null),
            )
          : resolve(null),
      'image/png',
    )
  })
}

/** S キー（修飾キーなし・押しっぱなしの繰り返しは除く）で保存するか。設定が OFF なら何もしない（キーも効かせない） */
export function isSaveKey(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'repeat'>, on: boolean): boolean {
  return on && e.code === 'KeyS' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
}

export interface ChartSnapshot {
  canvas: HTMLCanvasElement
  /** 描いている足の時間軸（D/W/M を押した直後は、読み終わるまで前の時間軸の足を出している） */
  tf: string
  /** キャンバスの倍率（キャンバスの幅 ÷ ペインの CSS の幅） */
  scale: number
  from?: string
  to?: string
}

/** 保存の結果: 保存した・取りやめた（ダイアログの取り消しと、保存中の 2 回目）・まだ描けていない・失敗した */
export type SaveResult = 'saved' | 'cancelled' | 'notReady' | 'failed'

/** 保存中か（連打・ボタンの 2 回押しで保存ダイアログを重ねて出さない） */
let saving = false

/** 今のチャートを PNG にして保存ダイアログを出す。名前と見出しの時間軸は、描いている足の時間軸（snap.tf） */
export async function saveChartImage(
  snap: ChartSnapshot | null,
  o: { code: string; name: string; tfLabel: (tf: string) => string; date: string },
): Promise<SaveResult> {
  if (saving) return 'cancelled'
  if (!snap) return 'notReady'
  saving = true
  try {
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
    const img = composeChartImage(snap.canvas, chartImageTitle(o.code, o.name, o.tfLabel(snap.tf)), chartImageRange(snap.from, snap.to), {
      bg: css('--panel'),
      fg: css('--text'),
      muted: css('--text-3'),
      line: css('--line'),
      font: css('--font') || 'sans-serif',
      scale: snap.scale,
    })
    const png = await canvasPng(img)
    if (!png) return 'failed'
    // main は取りやめ（cancelled）と書けなかった（failed）を分けて返す
    return await window.elecxstock.savePng(chartImageName(o.code, snap.tf, o.date), png)
  } catch {
    return 'failed'
  } finally {
    saving = false
  }
}

/** 保存の結果ごとのトーストの文言のキー（取りやめたときは出さない） */
export const SAVE_TOAST: Record<SaveResult, 'chart.imageSaved' | 'chart.imageNotReady' | 'chart.imageFailed' | null> = {
  saved: 'chart.imageSaved',
  cancelled: null,
  notReady: 'chart.imageNotReady',
  failed: 'chart.imageFailed',
}
