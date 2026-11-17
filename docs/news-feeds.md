# ニュースのフィード / News feeds

<!-- このファイルは npm run gen:news-feeds-doc が登録表（resources/news/feeds.json）から作る。手で直さない -->

ニュースのペイン（[design-news.md](design-news.md)）が取るフィードの一覧です（28 本）。利用者は URL を足せず、設定でオン・オフだけを選びます。既定でオンにできるのは、配信元の規約を確かめたフィードだけです。入れなかった候補と理由・確かめた結果は [news-feeds-notes.md](news-feeds-notes.md)。

The feeds the News pane fetches (28). Users cannot add URLs; they only turn feeds on or off in Settings. Only feeds whose terms have been checked can be on by default.

- 既定: 表示言語がこれのとき既定でオン（ja / en）。/ Default: on by default for these display languages.
- 要約: 「なし」は配信元の条件で要約（description）を出さない・持たない。/ Summary: "なし" means the summary is never shown or stored.

## 日本語 / Japanese

| 既定 | 印 | 名前 | 分類 | URL | 記事のホスト | 要約 | 規約の確認 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ja | JPX | 日本取引所グループ マーケットニュース（30 日） | 公的機関 | https://www.jpx.co.jp/rss/markets_news.xml | www.jpx.co.jp | なし | [2026-11-17](https://www.jpx.co.jp/term-of-use/) |
| ja | JPX | 日本取引所グループ ニュース（30 日） | 公的機関 | https://www.jpx.co.jp/rss/jpx-news.xml | www.jpx.co.jp | なし | [2026-11-17](https://www.jpx.co.jp/term-of-use/) |
| ja | 日銀 | 日本銀行 新着情報（30 日） | 公的機関 | https://www.boj.or.jp/rss/whatsnew.xml | www.boj.or.jp | あり | [2026-11-17](https://www.boj.or.jp/about/copyright.htm) |
| — | NHK | NHK ニュース 経済（30 日） | 市況 | https://news.web.nhk/n-data/conf/na/rss/cat5.xml | news.web.nhk | あり | 未確認 |
| — | Y! | Yahoo!ニュース 経済（トピックス）（30 日） | 市況 | https://news.yahoo.co.jp/rss/topics/business.xml | news.yahoo.co.jp | あり | 未確認 |
| — | 時事 | 時事ドットコム（30 日） | 市況 | https://www.jiji.com/rss/ranking.rdf | www.jiji.com | あり | 未確認 |
| — | 朝日 | 朝日新聞 経済（有料・30 日） | 市況 | https://www.asahi.com/rss/asahi/business.rdf | www.asahi.com | あり | 未確認 |
| — | 東洋 | 東洋経済オンライン（30 日） | 読み物 | https://toyokeizai.net/list/feed/rss | toyokeizai.net | あり | 未確認 |
| — | DOL | ダイヤモンド・オンライン（30 日） | 読み物 | https://diamond.jp/list/feed/rss/dol | diamond.jp | あり | 未確認 |
| — | 日経B | 日経ビジネス電子版（有料・30 日） | 読み物 | https://business.nikkei.com/rss/sns/nb.rdf | business.nikkei.com | あり | 未確認 |
| — | ITmB | ITmedia ビジネスオンライン（30 日） | 読み物 | https://rss.itmedia.co.jp/rss/2.0/business.xml | www.itmedia.co.jp | あり | 未確認 |
| — | 金融庁 | 金融庁 新着情報（30 日） | 公的機関 | https://www.fsa.go.jp/fsaNewsListAll_rss2.xml | www.fsa.go.jp | あり | 未確認 |
| — | 内閣府 | 内閣府 新着情報（30 日） | 公的機関 | https://www.cao.go.jp/rss/news.rdf | www.cao.go.jp, www5.cao.go.jp, www.esri.cao.go.jp, www.fsc.go.jp | あり | 未確認 |
| — | 財務省 | 財務省 新着情報（30 日） | 公的機関 | https://www.mof.go.jp/news.rss | www.mof.go.jp | あり | 未確認 |

## 英語 / English

| 既定 | 印 | 名前 | 分類 | URL | 記事のホスト | 要約 | 規約の確認 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | NAR | Nikkei Asia（有料・日付なし・30 日） | 市況 | https://asia.nikkei.com/rss/feed/nar | asia.nikkei.com | あり | 未確認 |
| — | JT | The Japan Times Business（30 日） | 市況 | https://www.japantimes.co.jp/business/feed/ | www.japantimes.co.jp | あり | 未確認 |
| ja, en | BBG | Bloomberg Markets（© Bloomberg L.P.・7 日） | 市況 | https://www.bloomberg.com/feeds/markets/news.rss | www.bloomberg.com | なし | [2026-11-17](https://www.bloomberg.com/notices/tos/) |
| — | CNBC | CNBC Asia（30 日） | 市況 | https://www.cnbc.com/id/19832390/device/rss/rss.html | www.cnbc.com | あり | 未確認 |
| en | BOJ | Bank of Japan（30 日） | 公的機関 | https://www.boj.or.jp/en/rss/whatsnew.xml | www.boj.or.jp | あり | [2026-11-17](https://www.boj.or.jp/about/copyright.htm) |
| en | JPX | JPX News（30 日） | 公的機関 | https://www.jpx.co.jp/english/rss/jpx-news.xml | www.jpx.co.jp | なし | [2026-11-17](https://www.jpx.co.jp/term-of-use/) |
| — | BBG | Bloomberg Economics（© Bloomberg L.P.・7 日） | 市況 | https://www.bloomberg.com/feeds/economics/news.rss | www.bloomberg.com | なし | [2026-11-17](https://www.bloomberg.com/notices/tos/) |
| — | CNBC | CNBC Markets（30 日） | 市況 | https://www.cnbc.com/id/20910258/device/rss/rss.html | www.cnbc.com | あり | 未確認 |
| — | FT | Financial Times Markets（有料・30 日） | 市況 | https://www.ft.com/markets?format=rss | www.ft.com | あり | 未確認 |
| — | WSJ | WSJ Markets（有料・30 日） | 市況 | https://feeds.content.dowjones.io/public/rss/RSSMarketsMain | www.wsj.com | あり | 未確認 |
| — | MW | MarketWatch Top Stories（30 日） | 市況 | https://feeds.content.dowjones.io/public/rss/mw_topstories | www.marketwatch.com | あり | 未確認 |
| — | Fed | Federal Reserve (monetary policy)（30 日） | 公的機関 | https://www.federalreserve.gov/feeds/press_monetary.xml | www.federalreserve.gov | あり | 未確認 |
| — | ECB | ECB Press（30 日） | 公的機関 | https://www.ecb.europa.eu/rss/press.html | www.ecb.europa.eu | あり | 未確認 |
| — | NDAQ | Nasdaq Markets（30 日） | 市況 | https://www.nasdaq.com/feed/rssoutbound?category=Markets | www.nasdaq.com | あり | 未確認 |
