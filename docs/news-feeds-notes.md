# ニュースのフィードの候補（手で書く注）

登録したフィードの一覧は [news-feeds.md](news-feeds.md)（登録表 `resources/news/feeds.json` から `npm run gen:news-feeds-doc` で作る）。
このファイルは、候補を選んだときの記録（取れるか・件数・ホスト・入れなかった候補と理由）を手で書く。規約の調査と判断は [news-feeds-terms.md](news-feeds-terms.md)。

2026-11-17 に実際に取って確かめた（状態・件数・最新の日付・記事のリンクのホスト）。取った見出しは保存していない。
**規約を確かめたのは Bloomberg・日本銀行・日本取引所グループ**（2026-11-17。[design-news.md](design-news.md) §2.1・§2.2）。規約を確かめたフィードだけを既定オンにできる（L2 のテスト）。下の「判定」の ◎ は
**規約を確かめたあとの目標**で、今は日銀・JPX・Bloomberg だけがオンになる（JPX と Bloomberg は要約なし）。翻訳はしない（表示とコピーだけ。design-news.md §6・§7.4）。

印: ◎ 既定でオン（目標）／ ○ 登録するが既定はオフ ／ × 入れない。分類: 市況（市況・経済）／ 読み物 ／ 公的機関

## 日本語（表示言語が日本語のときの既定）

| 判定 | 名前                                                                                                 | 印     | 分類     | URL                                                            | 記事のホスト        | 件数 | 備考                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------- | ------------------- | ---- | ------------------------------------------------------------------------------------------ |
| ◎    | 日本取引所グループ マーケットニュース                                                                | JPX    | 公的機関 | https://www.jpx.co.jp/rss/markets_news.xml                     | www.jpx.co.jp       | 34   | 売買停止・上場廃止・新規上場など。ホストは許可リストに既にある                             |
| ◎    | 日本取引所グループ ニュース                                                                          | JPX    | 公的機関 | https://www.jpx.co.jp/rss/jpx-news.xml                         | www.jpx.co.jp       | 5    |                                                                                            |
| ◎    | 日本銀行 新着情報                                                                                    | 日銀   | 公的機関 | https://www.boj.or.jp/rss/whatsnew.xml                         | www.boj.or.jp       | 71   | 統計の公表が多い（1 フィード 30 件までで抑える）                                           |
| ◎    | NHK ニュース 経済                                                                                    | NHK    | 市況     | https://news.web.nhk/n-data/conf/na/rss/cat5.xml               | news.web.nhk        | 102  | 新しい URL。旧 URL（www3.nhk.or.jp）は 2026-08-08 で止まっている                           |
| ◎    | Yahoo!ニュース 経済（トピックス）                                                                    | Y!     | 市況     | https://news.yahoo.co.jp/rss/topics/business.xml               | news.yahoo.co.jp    | 8    | 編集部が選んだ 8 件。規約は個人の利用を前提にしている（要確認）                            |
| ◎    | 時事ドットコム                                                                                       | 時事   | 市況     | https://www.jiji.com/rss/ranking.rdf                           | www.jiji.com        | 10   | アクセスの順位（経済に限らない）。経済だけの RSS を探す                                    |
| ○    | 朝日新聞 経済                                                                                        | 朝日   | 市況     | https://www.asahi.com/rss/asahi/business.rdf                   | www.asahi.com       | 24   | Content-Type が text/html（中身は RDF）。記事は有料のことがある                            |
| ○    | 東洋経済オンライン                                                                                   | 東洋   | 読み物   | https://toyokeizai.net/list/feed/rss                           | toyokeizai.net      | 20   | 生活・社会の記事も多い                                                                     |
| ○    | ダイヤモンド・オンライン                                                                             | DOL    | 読み物   | https://diamond.jp/list/feed/rss/dol                           | diamond.jp          | 25   |                                                                                            |
| ○    | 日経ビジネス電子版                                                                                   | 日経B  | 読み物   | https://business.nikkei.com/rss/sns/nb.rdf                     | business.nikkei.com | 20   | 発行は日経BP（日本経済新聞社ではない）。`rss/sns/` は SNS 向けの用途かもしれない（要確認） |
| ○    | ITmedia ビジネスオンライン                                                                           | ITmB   | 読み物   | https://rss.itmedia.co.jp/rss/2.0/business.xml                 | www.itmedia.co.jp   | 20   | 記事はフィードと別のホスト                                                                 |
| ○    | 金融庁 新着情報                                                                                      | 金融庁 | 公的機関 | https://www.fsa.go.jp/fsaNewsListAll_rss2.xml                  | www.fsa.go.jp       | 15   | 日付が `JST` の略号（置き換えの表で読む）                                                  |
| ○    | 内閣府 新着情報                                                                                      | 内閣府 | 公的機関 | https://www.cao.go.jp/rss/news.rdf                             | www.cao.go.jp ほか  | 10   | 景気の指標の公表。記事のホストが esri.cao.go.jp・fsc.go.jp などに分かれる                  |
| ○    | 財務省 新着情報                                                                                      | 財務省 | 公的機関 | https://www.mof.go.jp/news.rss                                 | www.mof.go.jp       | 100  | 件数が多く投資に関係の薄いものが多い                                                       |
| ×    | Bloomberg 日本語（wor.jp）                                                                           |        |          | https://assets.wor.jp/rss/rdf/bloomberg/top.rdf                |                     | 0    | **403 で取れない**（Cloudflare。UA を変えても同じ）。第三者が作った RSS                    |
| ×    | ロイター 日本語（wor.jp）                                                                            |        |          | https://assets.wor.jp/rss/rdf/reuters/top.rdf                  |                     | 0    | 同上。ロイターの公式の RSS は終わっている                                                  |
| ×    | 日本経済新聞（wor.jp）                                                                               |        |          | https://assets.wor.jp/rss/rdf/nikkei/news.rdf                  |                     | 30   | 取れるが第三者が作った RSS。配るアプリには入れない                                         |
| ×    | 産経ニュース 経済                                                                                    |        |          | https://www.sankei.com/arc/outboundfeeds/rss/category/economy/ |                     | 54   | 記事のリンクが壊れている（`null/article/…`）                                               |
| ×    | 共同通信（kyodo.co.jp）                                                                              |        |          | https://www.kyodo.co.jp/feed/                                  |                     | 10   | 企業のプレスリリースの配信で、ニュースではない                                             |
| ×    | Investing.com 日本                                                                                   |        |          | https://jp.investing.com/rss/news.rss                          |                     | 10   | 自動生成の記事が多い。日付に時刻帯が無い                                                   |
| ×    | 適時開示（やのしん）                                                                                 |        |          | https://webapi.yanoshin.jp/webapi/tdnet/list/recent.rss        |                     | 300  | 第三者の API。量が多すぎる                                                                 |
| ×    | 株探・みんかぶ・モーニングスター・トウシル・マネクリ・ザイ・統計局・JAPAN-REIT.COM・不動産証券化協会 |        |          | （各社）                                                       |                     |      | 404 / 403 / RSS なし（確かめた URL では見つからない）                                      |

- **J-REIT の出所が見つからない**。不動産証券化協会・JAPAN-REIT.COM は RSS が見つからなかった。JPX のマーケットニュースに
  REIT の上場・売買停止は入る。
- 日本語の Bloomberg を出す手段は見つからなかった。英語の Bloomberg（公式）を **日本語の表示でも既定でオン**にし、設定の日本語のフィードの一覧にも出す
  （登録表の `defaultOnFor: ["ja", "en"]`・`listFor: ["ja", "en"]`）。見出しは英語のまま出し、訳さない。要約は出さず、「© Bloomberg L.P.」を添え、
  キャッシュは 7 日まで（design-news.md §2.1）。日本語で読みたい人は、見出しをコピー（Ctrl+C）して自分で別のアプリで訳す。

◎ と ○ の行は `resources/news/feeds.json`（登録表）に入れた（一覧は [news-feeds.md](news-feeds.md)。JSON から作る）。この表は選んだときの記録として残す。

## 英語（表示言語が英語のときの既定）

英語の利用者も見ているのは日本株なので、日本・アジアに強い出所を既定にし、米国の総合は既定オフにする。

| 判定 | 名前                          | 印   | 分類     | URL                                                         | 記事のホスト           | 件数 | 備考                                                                                                                                                                                               |
| ---- | ----------------------------- | ---- | -------- | ----------------------------------------------------------- | ---------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ◎    | Nikkei Asia                   | NAR  | 市況     | https://asia.nikkei.com/rss/feed/nar                        | asia.nikkei.com        | 50   | **項目に日付が無い**（初めて見た時刻・「≈」）。有料のことがある                                                                                                                                    |
| ◎    | The Japan Times Business      | JT   | 市況     | https://www.japantimes.co.jp/business/feed/                 | www.japantimes.co.jp   | 20   |                                                                                                                                                                                                    |
| ◎    | Bloomberg Markets             | BBG  | 市況     | https://feeds.bloomberg.com/markets/news.rss                | www.bloomberg.com      | 20   | 公式。**2026-11-17 の実装時に `www.bloomberg.com/feeds/markets/news.rss` へ 301 で移っていた**（登録表は新しい URL）。**規約を確認済み（§2.1）**。要約なし・© 表示・7 日。日本語の表示でも既定オン |
| ◎    | CNBC Asia                     | CNBC | 市況     | https://www.cnbc.com/id/19832390/device/rss/rss.html        | www.cnbc.com           | 30   | `ttl` 60（参考として出す。間隔は延ばさない）                                                                                                                                                       |
| ◎    | Bank of Japan                 | BOJ  | 公的機関 | https://www.boj.or.jp/en/rss/whatsnew.xml                   | www.boj.or.jp          | 45   | リンクが http（https に上げる）                                                                                                                                                                    |
| ◎    | JPX News                      | JPX  | 公的機関 | https://www.jpx.co.jp/english/rss/jpx-news.xml              | www.jpx.co.jp          | 1    | まれ（`staleDays` 90）                                                                                                                                                                             |
| ○    | Bloomberg Economics           | BBG  | 市況     | https://feeds.bloomberg.com/economics/news.rss              | www.bloomberg.com      | 20   | 要約なし・© 表示・日本語の一覧にも出す                                                                                                                                                             |
| ○    | CNBC Markets                  | CNBC | 市況     | https://www.cnbc.com/id/20910258/device/rss/rss.html        | www.cnbc.com           | 30   | 米国の市況                                                                                                                                                                                         |
| ○    | Financial Times Markets       | FT   | 市況     | https://www.ft.com/markets?format=rss                       | www.ft.com             | 25   | 有料                                                                                                                                                                                               |
| ○    | WSJ Markets                   | WSJ  | 市況     | https://feeds.content.dowjones.io/public/rss/RSSMarketsMain | www.wsj.com            | 61   | 有料                                                                                                                                                                                               |
| ○    | MarketWatch Top Stories       | MW   | 市況     | https://feeds.content.dowjones.io/public/rss/mw_topstories  | www.marketwatch.com    | 10   |                                                                                                                                                                                                    |
| ○    | Federal Reserve（金融政策）   | Fed  | 公的機関 | https://www.federalreserve.gov/feeds/press_monetary.xml     | www.federalreserve.gov | 15   | press_all は執行の知らせなどが多いので金融政策だけ                                                                                                                                                 |
| ○    | ECB Press                     | ECB  | 公的機関 | https://www.ecb.europa.eu/rss/press.html                    | www.ecb.europa.eu      | 15   |                                                                                                                                                                                                    |
| ○    | Nasdaq Markets                | NDAQ | 市況     | https://www.nasdaq.com/feed/rssoutbound?category=Markets    | www.nasdaq.com         | 15   |                                                                                                                                                                                                    |
| ×    | SEC Press Releases            |      |          | https://www.sec.gov/news/pressreleases.rss                  |                        | 25   | sec.gov は UA に連絡先を求める（入れない）                                                                                                                                                         |
| ×    | Seeking Alpha Market Currents |      |          | https://seekingalpha.com/market_currents.xml                |                        | 7    | 規約が厳しい                                                                                                                                                                                       |
| ×    | Investing.com                 |      |          | https://www.investing.com/rss/news.rss                      |                        | 10   | 日付に時刻帯が無い・自動生成が多い                                                                                                                                                                 |
| ×    | MarketWatch Market Pulse      |      |          | https://feeds.content.dowjones.io/public/rss/mw_marketpulse |                        | 30   | 最新が 2025-07（止まっている）                                                                                                                                                                     |
| ×    | Yahoo Finance（全体）         |      |          | https://finance.yahoo.com/news/rssindex                     |                        |      | 404                                                                                                                                                                                                |

## 規約を確かめた結果

[news-feeds-terms.md](news-feeds-terms.md) に移した（調べ方・判断の基準・配信元ごとの結果・登録しなかったものの見直し・最終の構成）。

## 別案（後から）: 銘柄のニュース

`https://feeds.finance.yahoo.com/rss/2.0/headline?s=7203.T` は銘柄ごとの見出しを返す（200・17 件。英語だけ・記事のホストが様々）。
ホストは許可リストに既にある。チャートと同じリンク色の銘柄の見出しを出すモードにできるが、英語だけで記事のホストが読めないので最初の版には入れない。
