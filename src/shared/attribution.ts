// Lightweight Charts の帰属表示（§10）。TradingView は NOTICE の帰属表示と tradingview.com へのリンクを、利用者が見る画面に載せることを求めている。
// 文言は上流の NOTICE のまま（「(с)」の с はキリル文字。上流のとおり）。npm のパッケージには NOTICE が入っていないので、
// 同じ文言を scripts/notices/lightweight-charts.NOTICE に置き、THIRD_PARTY_NOTICES.txt に入れる（一致は単体テストが確かめる）

/** NOTICE の 2 行（設定の「このアプリについて」と初回の画面にそのまま出す） */
export const LWC_NOTICE = ['TradingView Lightweight Charts™', 'Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/'] as const

/** 帰属表示のリンク先 */
export const TRADINGVIEW_URL = 'https://www.tradingview.com/'

/** 文の中の token を境に前・token・後ろに分ける（token の部分をリンクにして出す）。無ければ全体を before に */
export function splitToken(text: string, token: string): { before: string; token: string; after: string } {
  const i = text.indexOf(token)
  if (i < 0) return { before: text, token: '', after: '' }
  return { before: text.slice(0, i), token, after: text.slice(i + token.length) }
}

/** NOTICE の 2 行目を、URL（リンクにする部分）とその前に分けたもの */
export const LWC_NOTICE_PARTS = splitToken(LWC_NOTICE[1], TRADINGVIEW_URL)

/** データ源の Yahoo Finance のリンク先。日本語の画面では Yahoo!ファイナンス、それ以外は Yahoo Finance */
export const yahooUrl = (lang: string) => (lang === 'ja' ? 'https://finance.yahoo.co.jp/' : 'https://finance.yahoo.com/')
