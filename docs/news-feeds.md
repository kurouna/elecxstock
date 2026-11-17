# ニュースのフィード / News feeds

<!-- このファイルは npm run gen:news-feeds-doc が登録表（resources/news/feeds.json）から作る。手で直さない -->

ニュースのペイン（[design-news.md](design-news.md)）が取る、同梱のフィードの一覧です（23 本。日本語 10・英語 13）。利用者は URL を足せず、設定でオン・オフだけを選びます。どのフィードも配信元の規約を確かめてあります。調べた内容と判断（既定でオンにする・要約を出す・外す）は [news-feeds-terms.md](news-feeds-terms.md)。

The built-in feeds the News pane fetches (23: 10 Japanese, 13 English). Users cannot add URLs; they only turn feeds on or off in Settings. Every feed's terms have been checked.

- **日本語の表示で既定でオン**（5 本）: 日本取引所グループ マーケットニュース（JPX）・日本取引所グループ ニュース（JPX）・日本銀行 新着情報（日銀）・金融庁 新着情報（金融庁）・Bloomberg Markets（BBG）
- **英語の表示で既定でオン**（6 本）: Nikkei Asia（NAR）・Bloomberg Markets（BBG）・Bank of Japan（BOJ）・JPX News（JPX）・Federal Reserve (monetary policy)（Fed）・ECB Press（ECB）
- 既定: 表示言語がこれのとき既定でオン。「—」は既定でオフ（利用者が設定でオンにすれば取れる）。/ Default: on by default for these display languages; "—" is off by default.
- 要約: 「出さない」は配信元の条件で要約（description）を出さない・持たない。「出す」でも配信元の要約が空のことがある（そのときは「要約はありません」）。/ Summary: "出さない" means it is never shown or stored.
- キャッシュは 30 日まで（備考に書いたものを除く）。/ Headlines are kept for 30 days unless noted.

## 日本語 / Japanese

| 印 | 名前 | 分類 | 既定でオン | 要約 | 備考 | URL | 記事のホスト | 規約の確認 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JPX | 日本取引所グループ マーケットニュース | 公的機関 | 日本語 | 出さない |  | https://www.jpx.co.jp/rss/markets_news.xml | www.jpx.co.jp | [2026-11-17](https://www.jpx.co.jp/term-of-use/) |
| JPX | 日本取引所グループ ニュース | 公的機関 | 日本語 | 出さない |  | https://www.jpx.co.jp/rss/jpx-news.xml | www.jpx.co.jp | [2026-11-17](https://www.jpx.co.jp/term-of-use/) |
| 日銀 | 日本銀行 新着情報 | 公的機関 | 日本語 | 出す |  | https://www.boj.or.jp/rss/whatsnew.xml | www.boj.or.jp | [2026-11-17](https://www.boj.or.jp/about/copyright.htm) |
| NHK | NHK ニュース 経済 | 市況 | — | 出さない |  | https://news.web.nhk/n-data/conf/na/rss/cat5.xml | news.web.nhk | [2026-11-17](https://www.nhk.or.jp/toppage/rss/) |
| 朝日 | 朝日新聞 経済 | 市況 | — | 出さない | 有料 | https://www.asahi.com/rss/asahi/business.rdf | www.asahi.com | [2026-11-17](https://www.asahi.com/information/service/rss.html) |
| 東洋 | 東洋経済オンライン | 読み物 | — | 出さない |  | https://toyokeizai.net/list/feed/rss | toyokeizai.net | [2026-11-17](https://toyokeizai.net/list/base-terms) |
| DOL | ダイヤモンド・オンライン | 読み物 | — | 出さない |  | https://diamond.jp/list/feed/rss/dol | diamond.jp | [2026-11-17](https://www.diamond.co.jp/tos/dol.html) |
| 日経B | 日経ビジネス電子版 | 読み物 | — | 出さない | 有料 | https://business.nikkei.com/rss/sns/nb.rdf | business.nikkei.com | [2026-11-17](https://www.nikkeibp.co.jp/atcl/corporate/copyright/) |
| 金融庁 | 金融庁 新着情報 | 公的機関 | 日本語 | 出す |  | https://www.fsa.go.jp/fsaNewsListAll_rss2.xml | www.fsa.go.jp | [2026-11-17](https://www.fsa.go.jp/rules/index.html) |
| 財務省 | 財務省 新着情報 | 公的機関 | — | 出す |  | https://www.mof.go.jp/news.rss | www.mof.go.jp | [2026-11-17](https://www.mof.go.jp/about_mof/notice/index.html) |

## 英語 / English

| 印 | 名前 | 分類 | 既定でオン | 要約 | 備考 | URL | 記事のホスト | 規約の確認 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NAR | Nikkei Asia | 市況 | 英語 | 出さない | 有料・日付なし（初めて見た時刻に「≈」） | https://asia.nikkei.com/rss/feed/nar | asia.nikkei.com | [2026-11-17](https://info.asia.nikkei.com/rss) |
| BBG | Bloomberg Markets | 市況 | 日本語・英語 | 出さない | © Bloomberg L.P.・7 日まで・日本語の一覧にも出る | https://www.bloomberg.com/feeds/markets/news.rss | www.bloomberg.com | [2026-11-17](https://www.bloomberg.com/notices/tos/) |
| CNBC | CNBC Asia | 市況 | — | 出さない |  | https://www.cnbc.com/id/19832390/device/rss/rss.html | www.cnbc.com | [2026-11-17](https://versantmedia.com/terms) |
| BOJ | Bank of Japan | 公的機関 | 英語 | 出す |  | https://www.boj.or.jp/en/rss/whatsnew.xml | www.boj.or.jp | [2026-11-17](https://www.boj.or.jp/about/copyright.htm) |
| JPX | JPX News | 公的機関 | 英語 | 出さない |  | https://www.jpx.co.jp/english/rss/jpx-news.xml | www.jpx.co.jp | [2026-11-17](https://www.jpx.co.jp/term-of-use/) |
| BBG | Bloomberg Economics | 市況 | — | 出さない | © Bloomberg L.P.・7 日まで・日本語の一覧にも出る | https://www.bloomberg.com/feeds/economics/news.rss | www.bloomberg.com | [2026-11-17](https://www.bloomberg.com/notices/tos/) |
| CNBC | CNBC Markets | 市況 | — | 出さない |  | https://www.cnbc.com/id/20910258/device/rss/rss.html | www.cnbc.com | [2026-11-17](https://versantmedia.com/terms) |
| FT | Financial Times Markets | 市況 | — | 出す | 有料・© The Financial Times Limited | https://www.ft.com/markets?format=rss | www.ft.com | [2026-11-17](https://help.ft.com/legal-privacy/copyright-policy/) |
| WSJ | WSJ Markets | 市況 | — | 出さない | 有料 | https://feeds.content.dowjones.io/public/rss/RSSMarketsMain | www.wsj.com | [2026-11-17](https://www.dowjones.com/terms-of-use/) |
| MW | MarketWatch Top Stories | 市況 | — | 出さない |  | https://feeds.content.dowjones.io/public/rss/mw_topstories | www.marketwatch.com | [2026-11-17](https://www.dowjones.com/terms-of-use/) |
| Fed | Federal Reserve (monetary policy) | 公的機関 | 英語 | 出す |  | https://www.federalreserve.gov/feeds/press_monetary.xml | www.federalreserve.gov | [2026-11-17](https://www.federalreserve.gov/disclaimer.htm) |
| ECB | ECB Press | 公的機関 | 英語 | 出す |  | https://www.ecb.europa.eu/rss/press.html | www.ecb.europa.eu | [2026-11-17](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html) |
| NDAQ | Nasdaq Markets | 市況 | — | 出さない |  | https://www.nasdaq.com/feed/rssoutbound?category=Markets | www.nasdaq.com | [2026-11-17](https://www.nasdaq.com/legal) |
