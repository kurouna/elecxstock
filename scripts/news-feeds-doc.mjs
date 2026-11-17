// ニュースのフィードの一覧（docs/news-feeds.md）を、登録表（resources/news/feeds.json）から作る（純粋な関数）。
// 作るのは scripts/gen-news-feeds-doc.mjs、文書が登録表と合っているかは tests/unit/news/feeds-doc.test.ts が確かめる。
// 入れなかった候補と理由・確かめた結果の注は、手で書く docs/news-feeds-notes.md に置く
const esc = (s) => String(s ?? '').replaceAll('|', String.raw`\|`)
const GROUP = { market: '市況', reading: '読み物', official: '公的機関' }

/** @param {{ feeds: any[] }} reg */
export function newsFeedsDoc(reg) {
  const out = [
    '# ニュースのフィード / News feeds',
    '',
    '<!-- このファイルは npm run gen:news-feeds-doc が登録表（resources/news/feeds.json）から作る。手で直さない -->',
    '',
    `ニュースのペイン（[design-news.md](design-news.md)）が取るフィードの一覧です（${reg.feeds.length} 本）。利用者は URL を足せず、設定でオン・オフだけを選びます。` +
      '既定でオンにできるのは、配信元の規約を確かめたフィードだけです。入れなかった候補と理由・確かめた結果は [news-feeds-notes.md](news-feeds-notes.md)。',
    '',
    `The feeds the News pane fetches (${reg.feeds.length}). Users cannot add URLs; they only turn feeds on or off in Settings. Only feeds whose terms have been checked can be on by default.`,
    '',
    '- 既定: 表示言語がこれのとき既定でオン（ja / en）。/ Default: on by default for these display languages.',
    '- 要約: 「なし」は配信元の条件で要約（description）を出さない・持たない。/ Summary: "なし" means the summary is never shown or stored.',
    '',
  ]
  for (const lang of ['ja', 'en']) {
    const fs = reg.feeds.filter((f) => f.lang === lang)
    out.push(
      lang === 'ja' ? '## 日本語 / Japanese' : '## 英語 / English',
      '',
      '| 既定 | 印 | 名前 | 分類 | URL | 記事のホスト | 要約 | 規約の確認 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const f of fs) {
      const flags = [
        f.paywall ? '有料' : '',
        f.undated ? '日付なし' : '',
        f.copyright ? esc(f.copyright) : '',
        f.keepDays ? `${f.keepDays} 日` : '',
      ]
        .filter(Boolean)
        .join('・')
      out.push(
        `| ${f.defaultOnFor.join(', ') || '—'} | ${esc(f.short)} | ${esc(f.name.ja)}${flags ? `（${flags}）` : ''} | ${GROUP[f.group]} | ${f.url} | ${f.linkHosts.join(', ')} | ${f.summary ? 'あり' : 'なし'} | ${f.terms ? `[${f.terms.checked}](${f.terms.url})` : '未確認'} |`,
      )
    }
    out.push('')
  }
  return `${out.join('\n')}`
}
