// ニュースのフィードの一覧（docs/news-feeds.md）を、登録表（resources/news/feeds.json）から作る（純粋な関数）。
// 作るのは scripts/gen-news-feeds-doc.mjs、文書が登録表と合っているかは tests/unit/news/feeds-doc.test.ts が確かめる。
// 規約の調査と判断は docs/news-feeds-terms.md、候補を選んだときの記録は docs/news-feeds-notes.md（どちらも手で書く）
const esc = (s) => String(s ?? '').replaceAll('|', String.raw`\|`)
const GROUP = { market: '市況', reading: '読み物', official: '公的機関' }
const LANG = { ja: '日本語', en: '英語' }
const DEFAULT_KEEP_DAYS = 30

/** 表示言語 lang で既定でオンのフィードの印と名前 */
const onFor = (reg, lang) => reg.feeds.filter((f) => f.defaultOnFor.includes(lang))

/** 備考: 有料・日付なし・権利の表記・キャッシュの日数（既定と違うときだけ）・ほかの言語の一覧にも出る */
function notes(f) {
  return [
    f.paywall ? '有料' : '',
    f.undated ? '日付なし（初めて見た時刻に「≈」）' : '',
    f.copyright ? esc(f.copyright) : '',
    f.keepDays && f.keepDays !== DEFAULT_KEEP_DAYS ? `${f.keepDays} 日まで` : '',
    (f.listFor ?? [f.lang]).filter((l) => l !== f.lang).map((l) => `${LANG[l]}の一覧にも出る`)[0] ?? '',
  ]
    .filter(Boolean)
    .join('・')
}

/** @param {{ feeds: any[] }} reg */
export function newsFeedsDoc(reg) {
  const count = (lang) => reg.feeds.filter((f) => f.lang === lang).length
  const names = (lang) =>
    onFor(reg, lang)
      .map((f) => `${esc(f.name.ja)}（${esc(f.short)}）`)
      .join('・')
  const out = [
    '# ニュースのフィード / News feeds',
    '',
    '<!-- このファイルは npm run gen:news-feeds-doc が登録表（resources/news/feeds.json）から作る。手で直さない -->',
    '',
    `ニュースのペイン（[design-news.md](design-news.md)）が取る、同梱のフィードの一覧です（${reg.feeds.length} 本。日本語 ${count('ja')}・英語 ${count('en')}）。` +
      '利用者は URL を足せず、設定でオン・オフだけを選びます。どのフィードも配信元の規約を確かめてあります。' +
      '調べた内容と判断（既定でオンにする・要約を出す・外す）は [news-feeds-terms.md](news-feeds-terms.md)。',
    '',
    `The built-in feeds the News pane fetches (${reg.feeds.length}: ${count('ja')} Japanese, ${count('en')} English). Users cannot add URLs; they only turn feeds on or off in Settings. Every feed's terms have been checked.`,
    '',
    `- **日本語の表示で既定でオン**（${onFor(reg, 'ja').length} 本）: ${names('ja')}`,
    `- **英語の表示で既定でオン**（${onFor(reg, 'en').length} 本）: ${names('en')}`,
    '- 既定: 表示言語がこれのとき既定でオン。「—」は既定でオフ（利用者が設定でオンにすれば取れる）。/ Default: on by default for these display languages; "—" is off by default.',
    '- 要約: 「出さない」は配信元の条件で要約（description）を出さない・持たない。「出す」でも配信元の要約が空のことがある（そのときは「要約はありません」）。/ Summary: "出さない" means it is never shown or stored.',
    `- キャッシュは ${DEFAULT_KEEP_DAYS} 日まで（備考に書いたものを除く）。/ Headlines are kept for ${DEFAULT_KEEP_DAYS} days unless noted.`,
    '',
  ]
  for (const lang of ['ja', 'en']) {
    out.push(
      lang === 'ja' ? '## 日本語 / Japanese' : '## 英語 / English',
      '',
      '| 印 | 名前 | 分類 | 既定でオン | 要約 | 備考 | URL | 記事のホスト | 規約の確認 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const f of reg.feeds.filter((x) => x.lang === lang)) {
      const on = f.defaultOnFor.map((l) => LANG[l]).join('・') || '—'
      const terms = f.terms ? `[${f.terms.checked}](${f.terms.url})` : '未確認'
      out.push(
        `| ${esc(f.short)} | ${esc(f.name.ja)} | ${GROUP[f.group]} | ${on} | ${f.summary ? '出す' : '出さない'} | ${notes(f)} | ${f.url} | ${f.linkHosts.join(', ')} | ${terms} |`,
      )
    }
    out.push('')
  }
  return `${out.join('\n')}`
}
