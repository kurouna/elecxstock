// Lightweight Charts の帰属表示（§10）。TradingView は NOTICE の帰属表示と tradingview.com へのリンクを、利用者が見る画面に載せることを求めている。
// 文言は上流の NOTICE のまま（「(с)」の с はキリル文字。上流のとおり）。npm のパッケージには NOTICE が入っていないので、
// 同じ文言を scripts/notices/lightweight-charts.NOTICE に置き、THIRD_PARTY_NOTICES.txt に入れる（一致は単体テストが確かめる）

/** NOTICE の 2 行（設定の「このアプリについて」と初回の画面にそのまま出す） */
export const LWC_NOTICE = ['TradingView Lightweight Charts™', 'Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/'] as const

/** 帰属表示のリンク先 */
export const TRADINGVIEW_URL = 'https://www.tradingview.com/'
