# 画面モック

要求仕様（[../requirements.md](../requirements.md)）の画面デザインを決めるためのモック。`index.html` をブラウザか Electron で開く。

- データはすべて架空（`mock-data.js`）。銘柄名は実在だが、価格・配当・指標は乱数。
- フォントはモックだけ Google Fonts から読む（アプリでは同梱する）。
- `lightweight-charts.standalone.production.js` は TradingView Lightweight Charts 5.3.0（Apache-2.0。ライセンス全文は `lightweight-charts.LICENSE`）。

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
