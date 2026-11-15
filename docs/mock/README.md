# 画面モック

要求仕様（[../requirements.md](../requirements.md)）の画面デザインを決めるためのモック。`index.html` をブラウザか Electron で開く。

- データはすべて架空（`mock-data.js`）。銘柄名は実在だが、価格・配当・指標は乱数。
- フォントはモックだけ Google Fonts から読む（アプリでは同梱する）。
- `lightweight-charts.standalone.production.js` は TradingView Lightweight Charts 5.3.0（Apache-2.0。ライセンス全文は `lightweight-charts.LICENSE`）。

## アラートのモック（P3）

`alerts.html` はアラート（[../requirements.md](../requirements.md) §6.14・[../design-alerts.md](../design-alerts.md)）の画面のモック。チャートのライブラリを読むので、`py -m http.server` などで手元のサーバーから開く（`file://` では動かない）。

| 操作 | キー |
|---|---|
| アラートのポップアップを開く・閉じる（未読があれば履歴） | Ctrl+Alt+L・トップバーのベル / Esc |
| アラートを作る / 直す | Ctrl+Alt+A・Insert / E（ダイアログ: 条件の行で ← → が値・O が ≥ と ≤、Tab で鳴り方の行へ移り Space で切り替え、Ctrl+Enter で作る） |
| 有効と停止 / 消す / 元に戻す（10 秒以内） | Space / Delete / Ctrl+Z |
| 銘柄を開く（ポップアップを閉じてチャートに出す。銘柄ジャンプと同じ規則） | Enter |
| アラートと履歴の切り替え / 履歴を既読に / 成立中だけ | H / R / Ctrl+Shift+F |
| 更新して判定する（擬似。2 件が鳴る） | F5 |

`alerts.html#popup`・`#history`・`#dialog`・`#fired` で状態を指定できる（スクリーンショット用）。

## ポートフォリオのペインのモック

`portfolio.html` は保有をダッシュボードで見せるペイン（[../design-portfolio.md](../design-portfolio.md)）のモック。一つのファイルで動く（`file://` で開ける）。上の帯で幅（S・M・L）・テーマ・色の向き・動き・状態（記録 1 年半・記録 3 日・読み込み中・保有なし）を切り替える。下に「配当の分析」（ドーナツ・年間配当と見込みの推移・増減要因・分類ごとのアコーディオンの表）が続く（PgDn）。キーは Tab（カード）・Alt+1〜6（期間）・← →（十字線・表の開閉）・↑ ↓ PgUp PgDn（一覧）・P・B・E・G（分類）・H・T（寄与の期間）・S（並べ替え）・PgUp PgDn（概要 ／ 配当の分析）・F5（擬似の更新。変わった桁をめくる）・Enter。資産推移で ← → を押すと、ヒーロー・損益寄与・資産構成がその日の値に連動する。`#size=L&light&focus=c-hist&cross=330`・`#div&focus=c-dtab&open=REIT`・`#contrib=2` のようにハッシュで状態を決められる。状態ごとのスクリーンショットは `portfolio-shots/`。

## 銘柄情報ペインの見直しのモック

`info.html` は銘柄情報ペインの見直し案。上に今のアプリのスクリーンショット（`info-before/`。`node scripts/shot-info-sizes.mjs` で撮る）、下に新しい案を、同じ枠の大きさ（XS 360×640・S 520×520・M 760×460・L 1100×620・XL 1500×640）で並べる。上のボタンで銘柄（保有・アラートあり / REIT / 値が一部無い）を切り替えられる。`py -m http.server` などで開く（画像を読むため）。

## スクリーニングの条件を選ぶダイアログのモック

`fields.html` は条件を選ぶダイアログの見直し案（分類のタブ・検索・説明・使用中と新しい指標の印）。今の画面は `fields-before/picker.png`、案のスクリーンショットは `fields-after/`。`#cat=income&sel=5`・`#q=保有` などで状態を指定できる。

## 試せる操作

| 操作 | キー |
|---|---|
| レイアウト切り替え（MTF / グリッド / スクリーナー / インカム） | Ctrl+Shift+1〜4 |
| 左のドロワーを開く・閉じる / ピン留め（グリッド） | Ctrl+B / Ctrl+Alt+B |
| チャートグリッド: 全タイルの時間軸 / 期間 / 格子 | D W M / Alt+1〜6 / + − |
| チャートグリッド: 対数 / 比較% / MA / 並べ替え | L / N / I / S |
| チャートグリッド: 売買候補の印 / 印だけ表示 / 1 枚を最大化 | Space / Shift+Space / Enter |
| スクリーナーの結果をグリッドで開く | Ctrl+Shift+G |
| スクリーン: 上書き保存 / 名前を付けて保存 / 開く / 名前の変更 | Ctrl+S / Ctrl+Shift+S / Ctrl+O / F2 |
| スクリーナー: 条件へ移る / 値を変える / 条件を消す | Tab / ← → / Delete |
| グリッド: 今の銘柄で固定 / 銘柄を足す / 外す / 並べ替え | P / 1〜9 → Enter / Delete / Alt+← → |
| 区切り線: ドラッグ / キー / ダブルクリックで等分 | Alt+Shift+矢印 |
| サイズを元に戻す / 取り消し | Ctrl+Alt+R（トップバーのボタン）/ Ctrl+Z |
| 一覧をめくる（同じ色のチャートが追従） | ↑ ↓ PgUp PgDn Home End |
| 列の移動 / 並べ替え | ← → / S |
| ウォッチリストの切り替え | Ctrl+PgUp / PgDn |
| ★のみ表示 / お気に入り | Ctrl+Shift+F / Ctrl+D |
| 銘柄ジャンプ | 1〜9 の数字キー |
| コマンドバー | Ctrl+K |
| ペイン間の移動 / 順に巡る | Alt+矢印 / F6 |
| 最大化 | Ctrl+Shift+Enter |
| リンク色 | Ctrl+0〜5 |
| チャート: 時間軸 / 対数 / 十字線 / ズーム | D W M / L / X → ← → / + − 0 |
| 更新ジョブ（擬似） | F5 |
| 設定（データの削除と取り直し） | Ctrl+, |
| ショートカット一覧 | F1 |

レイアウト（区切り線・グリッドの銘柄と設定）とスクリーンは localStorage に保存され、開き直しても残る。`#fresh=1` で初期状態に戻る。

URL のハッシュで状態を指定できる（スクリーンショット用）: `index.html#layout=1&lang=en&colors=us&density=compact&down=2&overlay=palette`（グリッドは `tf=W&period=3&scale=2&size=4&src=fav&dock=open` も指定できる）
