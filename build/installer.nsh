; アンインストール時に、利用者のデータを残すか尋ねる（NFR-Q9）
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "elecxstock のデータ（お気に入り・ウォッチリスト・取得した株価データ）も削除しますか？$\r$\nDelete elecxstock data (favorites, watchlists and fetched market data) too?" /SD IDNO IDNO keep
      RMDir /r "$APPDATA\elecxstock"
    keep:
  ${endIf}
!macroend
