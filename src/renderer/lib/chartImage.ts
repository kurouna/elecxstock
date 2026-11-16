// チャートの画像の保存（FR-C11）: 設定の「チャート」で ON にしたときだけ使える（既定 OFF。データは Yahoo Finance なので個人で使う範囲）。
// 見出しのボタン・S キー・「⋯」の項目から呼ぶ。Lightweight Charts の takeScreenshot は凡例（DOM）を含まないので、
// 銘柄・時間軸・見えている期間の 1 行を上に描き足してから PNG にする

/** 見出しの 1 行の高さ（CSS ピクセル） */
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

export interface ImageStyle {
  bg: string
  fg: string
  muted: string
  line: string
  font: string
  /** チャートのキャンバスの倍率（devicePixelRatio。見出しも同じ倍率で描く） */
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
  g.font = `600 ${Math.round(13 * s.scale)}px ${s.font}`
  g.fillStyle = s.fg
  g.fillText(title, pad, head / 2)
  if (range) {
    g.font = `${Math.round(11 * s.scale)}px ${s.font}`
    g.fillStyle = s.muted
    g.textAlign = 'right'
    g.fillText(range, out.width - pad, head / 2)
  }
  g.fillStyle = s.line
  g.fillRect(0, head - Math.max(1, Math.round(s.scale)), out.width, Math.max(1, Math.round(s.scale)))
  g.drawImage(shot, 0, head)
  return out
}

/** キャンバスを PNG のバイト列にする */
export function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    c.toBlob((b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x))) : resolve(null)), 'image/png')
  })
}

/** S キー（修飾キーなし）で保存するか。設定が OFF なら何もしない（キーも効かせない） */
export function isSaveKey(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>, on: boolean): boolean {
  return on && e.code === 'KeyS' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
}

export interface ChartSnapshot {
  canvas: HTMLCanvasElement
  from?: string
  to?: string
}

/** 今のチャートを PNG にして保存ダイアログを出す。保存したら true */
export async function saveChartImage(
  snap: ChartSnapshot | null,
  o: { code: string; name: string; tf: string; tfLabel: string; date: string },
): Promise<boolean> {
  if (!snap) return false
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
  const img = composeChartImage(snap.canvas, chartImageTitle(o.code, o.name, o.tfLabel), chartImageRange(snap.from, snap.to), {
    bg: css('--panel'),
    fg: css('--text'),
    muted: css('--text-3'),
    line: css('--line'),
    font: css('--font') || 'sans-serif',
    scale: window.devicePixelRatio || 1,
  })
  const png = await canvasPng(img)
  if (!png) return false
  return window.elecxstock.savePng(chartImageName(o.code, o.tf, o.date), png)
}
