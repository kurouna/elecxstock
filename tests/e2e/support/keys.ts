// キーボードの操作（FR-KB8）。1 キーごとに、描画 1 回分（requestAnimationFrame）と 20ms の早いほうだけ待つ。
// ダイアログの開閉・フォーカスの移動のあとは、移動先を expect してから次の keys を呼ぶ（固定の待ちで隠さない）
import type { Page } from '@playwright/test'

export const settle = (page: Page) =>
  page
    .evaluate(
      () =>
        new Promise<void>((r) => {
          const t = setTimeout(r, 20)
          requestAnimationFrame(() => {
            clearTimeout(t)
            r()
          })
        }),
    )
    .catch(() => {}) // 押したキーで窓が閉じたとき

export async function keys(page: Page, ...seq: string[]): Promise<void> {
  for (const k of seq) {
    await page.keyboard.press(k)
    await settle(page)
  }
}

/** 文字を打つ（IME を通さない。打ち終わりに 1 回だけ待つ） */
export async function type(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text)
  await settle(page)
}

/** 数字・英字のコードを 1 文字ずつキーとして押す（銘柄ジャンプが開く） */
export const codeKeys = (code: string) => [...code].map((c) => (/\d/.test(c) ? `Digit${c}` : `Key${c.toUpperCase()}`))
