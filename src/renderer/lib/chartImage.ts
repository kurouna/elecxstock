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

/** 保存中か（連打・ボタンの 2 回押しで保存ダイアログを重ねて出さない。チャートとパフォーマンス比較で共有） */
let saving = false
/** 保存を 1 つずつ行う。保存中に呼ばれたら取りやめる（'cancelled'） */
export async function exclusive<T>(f: () => Promise<T>): Promise<T | 'cancelled'> {
  if (saving) return 'cancelled'
  saving = true
  try {
    return await f()
  } finally {
    saving = false
  }
}

/** 今のチャートを PNG にして保存ダイアログを出す。名前と見出しの時間軸は、描いている足の時間軸（snap.tf） */
export async function saveChartImage(
  snap: ChartSnapshot | null,
  o: { code: string; name: string; tfLabel: (tf: string) => string; date: string },
): Promise<SaveResult> {
  if (!snap) return saving ? 'cancelled' : 'notReady'
  return exclusive(() => saveSnap(snap, o))
}
async function saveSnap(
  snap: ChartSnapshot,
  o: { code: string; name: string; tfLabel: (tf: string) => string; date: string },
): Promise<SaveResult> {
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
  }
}

// ---------------------------------------------------------------- パフォーマンス比較（SVG。docs/design-perf.md §7）
/** 保存の既定のファイル名。例: elecxstock-perf-2024-08-05-2026-11-13.png */
export function perfImageName(base: string, end: string): string {
  return `elecxstock-perf-${base}-${end}.png`.replace(/[\\/:*?"<>|\s]/g, '_')
}
/** SVG の中の var(--x[, 既定]) を実際の値に直す（画像にした SVG には CSS が効かないため） */
export function inlineCssVars(svg: string, resolve: (name: string) => string): string {
  return svg.replace(/var\((--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, n: string, d?: string) => resolve(n).trim() || (d ?? '').trim())
}
export interface PerfImageText {
  /** 上の 1 行の左（基準日 = 100 〜 終わりの日） */
  title: string
  /** 上の 1 行の右（価格の種類・日足／月次の精度・分割調整済み） */
  sub: string
  /** 下の 1 行の左（出典と注意） */
  source: string
}
/** SVG を画像（キャンバス）にし、上に見出し、下に出典と「elecxstock」を描き足す */
export async function svgToCanvas(svg: SVGSVGElement, text: PerfImageText, scale: number): Promise<HTMLCanvasElement | null> {
  const rootCss = getComputedStyle(svg)
  const css = (n: string) => rootCss.getPropertyValue(n)
  const w = svg.clientWidth
  const h = svg.clientHeight
  if (!w || !h) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  // 文字の見た目はコンポーネントの CSS（画像にすると効かない）なので、計算した値を属性に写す
  const src = svg.querySelectorAll('text, tspan')
  const dst = clone.querySelectorAll('text, tspan')
  src.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const d = dst[i]
    if (!d) return
    d.setAttribute('fill', cs.fill)
    d.setAttribute('font-family', cs.fontFamily)
    d.setAttribute('font-size', cs.fontSize)
    d.setAttribute('font-weight', cs.fontWeight)
  })
  for (const el of clone.querySelectorAll('[data-noimg]')) el.remove()
  const xml = inlineCssVars(new XMLSerializer().serializeToString(clone), css)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  await img.decode()
  const head = Math.round(HEADER_PX * scale)
  const foot = Math.round(22 * scale)
  const out = document.createElement('canvas')
  out.width = Math.round(w * scale)
  out.height = Math.round(h * scale) + head + foot
  const g = out.getContext('2d')
  if (!g) return null
  const font = css('--font').trim() || 'sans-serif'
  g.fillStyle = css('--panel').trim() || '#fff'
  g.fillRect(0, 0, out.width, out.height)
  g.textBaseline = 'middle'
  const pad = Math.round(8 * scale)
  const bold = `600 ${Math.round(13 * scale)}px ${font}`
  const thin = `${Math.round(11 * scale)}px ${font}`
  const fit = fitHeader(text.title, text.sub, out.width - pad * 2, Math.round(16 * scale), (x, b) => {
    g.font = b ? bold : thin
    return g.measureText(x).width
  })
  g.font = bold
  g.fillStyle = css('--text').trim() || '#000'
  g.fillText(fit.title, pad, head / 2)
  g.font = thin
  g.fillStyle = css('--text-3').trim() || '#666'
  if (fit.range) {
    g.textAlign = 'right'
    g.fillText(fit.range, out.width - pad, head / 2)
  }
  g.drawImage(img, 0, head, out.width, Math.round(h * scale))
  const fy = out.height - foot / 2
  g.textAlign = 'left'
  g.fillText(text.source, pad, fy)
  g.textAlign = 'right'
  g.font = bold
  g.fillText('elecxstock', out.width - pad, fy)
  return out
}
/** パフォーマンス比較のチャートを PNG にして保存ダイアログを出す */
export function savePerfImage(
  svg: SVGSVGElement | null | undefined,
  text: PerfImageText,
  name: string,
  scale: number,
): Promise<SaveResult> {
  if (!svg) return Promise.resolve(saving ? 'cancelled' : 'notReady')
  return exclusive(async (): Promise<SaveResult> => {
    try {
      const c = await svgToCanvas(svg, text, scale)
      if (!c) return 'notReady'
      const png = await canvasPng(c)
      if (!png) return 'failed'
      return await window.elecxstock.savePng(name, png)
    } catch {
      return 'failed'
    }
  })
}

/** 保存の結果ごとのトーストの文言のキー（取りやめたときは出さない） */
export const SAVE_TOAST: Record<SaveResult, 'chart.imageSaved' | 'chart.imageNotReady' | 'chart.imageFailed' | null> = {
  saved: 'chart.imageSaved',
  cancelled: null,
  notReady: 'chart.imageNotReady',
  failed: 'chart.imageFailed',
}
