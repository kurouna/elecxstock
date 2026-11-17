// テスト・デモ・スクリーンショット用のフィード（ELECXSTOCK_PROVIDER=stub のとき）。登録表の URL に、架空の見出しの RSS を返す。
// 見出しと要約はすべて架空（出所の名前だけ実在。CLAUDE.md の「テスト・デモ・スクリーンショットのデータはすべて架空」）。
// 時刻は今（ELECXSTOCK_NOW）からの相対。リンクはフィードの linkHosts の 1 つ目の下に作る（開いても記事はない）
import type { NewsFeed } from '@shared/news/schema'

type Row = [minutesAgo: number, title: string, summary?: string]
const JA: Record<string, Row[]> = {
  'ja.yahoo': [
    [
      15,
      '円相場、一時 1 ドル＝151 円台に　米金利の低下で（架空）',
      '東京外国為替市場で円が対ドルで上昇した。米長期金利の低下を受けて円を買う動きが広がった。（テスト用の架空の文）',
    ],
    [
      66,
      '日経平均、前場は小幅に反落　半導体株に利益確定売り（架空）',
      '午前の東京株式市場で日経平均は小幅に反落した。前日に上げた半導体関連株に利益確定の売りが出た。（テスト用の架空の文）',
    ],
    [16 * 60 + 40, '米株式市場、ダウ平均は続伸　長期金利の低下を好感（架空）', '米国株式市場でダウ平均は続伸した。（テスト用の架空の文）'],
  ],
  'ja.boj': [
    [
      22,
      '金融政策決定会合における主な意見（架空のテスト見出し）',
      '日本銀行は、金融政策決定会合における主な意見を公表しました。（テスト用の架空の文）',
    ],
    [95, '資金循環統計（速報）の公表（架空のテスト見出し）', '資金循環統計（速報）を公表しました。（テスト用の架空の文）'],
    [26 * 60, '企業物価指数（速報）（架空のテスト見出し）', '企業物価指数（速報）を公表しました。（テスト用の架空の文）'],
  ],
  'ja.jiji': [
    [
      31,
      'J-REIT 指数、続伸　長期金利の低下で買い戻し（架空）',
      '東証 REIT 指数は続伸した。長期金利の低下で分配金利回りとの差が意識された。（テスト用の架空の文）',
    ],
    [190, '輸出企業、下期の想定為替レートを見直し（架空）', '下期の想定為替レートを見直す企業が増えている。（テスト用の架空の文）'],
  ],
  'ja.nhk': [
    [
      44,
      '中間決算の発表が山場、増益の業種と下方修正の業種（架空）',
      '3 月期決算企業の中間決算の発表がほぼ終わった。（テスト用の架空の文）',
    ],
    [120, '新 NISA の口座数、前月比で増加（架空）', '金融機関の集計で、新 NISA の口座数が増えた。（テスト用の架空の文）'],
    [18 * 60, '国内企業物価、前年比で伸びが鈍化（架空）'],
  ],
  'ja.jpxnews': [
    [58, '年末年始の売買立会について（架空のテスト見出し）', '要約は出さないフィード（テスト用の架空の文）'],
    [20 * 60, '新規上場の承認（グロース市場）（架空）'],
  ],
  'ja.jpxmkt': [
    [150, '監理銘柄（確認中）の指定に関するお知らせ（架空）'],
    [9 * 60, '売買単位の変更に関するお知らせ（架空）'],
  ],
  'ja.toyo': [
    [
      9,
      '高配当株の選び方、利回りだけで決めないための 5 つの視点（架空）',
      '配当利回りが高いだけで選ぶと、減配や株価の下落で思わぬ損失につながることがある。（テスト用の架空の文）',
    ],
    [
      80,
      '株主優待の改廃が相次ぐ、個人投資家はどう向き合うか（架空）',
      '優待の廃止や長期保有の条件の追加が相次いでいる。（テスト用の架空の文）',
    ],
  ],
}
const EN: Record<string, Row[]> = {
  'en.bbgmkt': [
    [5, 'Asian stocks edge lower as traders weigh rate outlook (fictional)', 'Not shown: this feed does not allow summaries.'],
    [27, 'Japan REITs draw buyers as yield spread widens (fictional)'],
    [72, 'Yen steadies as central bank officials signal patience (fictional)'],
    [16 * 60, 'Dividend funds see inflows as investors seek income (fictional)'],
  ],
  'en.boj': [
    [
      21,
      'Summary of Opinions at the Monetary Policy Meeting (fictional test headline)',
      'The Bank released the summary of opinions. (Fictional test text.)',
    ],
    [24 * 60, 'Monetary Base (fictional test headline)', 'The Bank released monetary base statistics. (Fictional test text.)'],
  ],
  'en.jpx': [[100, 'Trading schedule for the year-end holidays (fictional test headline)']],
  'en.nar': [
    [
      8,
      'Japanese banks lift dividend targets after half-year results (fictional)',
      'Several lenders raised their payout guidance. (Fictional test text.)',
    ],
    [60, 'Exchange tightens listing maintenance rules (fictional)'],
  ],
  'en.jt': [
    [
      47,
      'Tokyo firms revise forex assumptions as yen steadies (fictional)',
      'Exporters are reassessing their forecasts. (Fictional test text.)',
    ],
  ],
  'en.cnbcasia': [
    [14, 'Yen strengthens as U.S. yields fall (fictional)'],
    [130, 'Asia markets mixed ahead of key data (fictional)'],
  ],
}
const generic = (f: NewsFeed): Row[] =>
  f.lang === 'ja' ? [[35, `${f.name.ja}の架空の見出し（テスト用）`]] : [[35, `Fictional headline from ${f.name.en} (test)`]]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** フィードの架空の RSS（日付の無いフィードは pubDate を書かない） */
export function stubRss(f: NewsFeed, now: number): string {
  const rows = { ...JA, ...EN }[f.id] ?? generic(f)
  const host = f.linkHosts[0]
  const items = rows
    .map(([m, t, s], i) => {
      const date = f.undated ? '' : `<pubDate>${new Date(now - m * 60_000).toUTCString()}</pubDate>`
      return `<item><title>${esc(t)}</title><link>https://${host}/fictional/${f.id}/${i}</link>${date}${s ? `<description>${esc(s)}</description>` : ''}</item>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(f.name.en)} (stub)</title>${items}</channel></rss>`
}

/** 登録表の URL に架空の RSS を返す fetch（ネットワークに出ない） */
export function createStubNewsFetch(feeds: () => readonly NewsFeed[], now: () => number): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const f = feeds().find((x) => x.url === url)
    if (!f) return new Response('not found', { status: 404 })
    return new Response(stubRss(f, now()), { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
  }) as typeof fetch
}
