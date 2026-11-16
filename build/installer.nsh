; electron-builder の NSIS に差し込む（nsis.include）。docs/design-background.md §4.6

; 動いている elecxstock を、保存を終えてから終わらせる（FR-BG8）。electron-builder の既定は taskkill / Stop-Process で止めるので、
; 保存の流し込みと Core の停止を通らない。常駐（閉じても通知領域に残す）にすると、動いたまま上書きの更新をすることが増える。
; インストールの節とアンインストールの節で呼ばれる（ウィザードを開いただけでは呼ばれない）。
; このマクロを定義すると electron-builder は getProcessInfo.nsh の取り込みと Var pid を外すので、ここで入れる
!include "getProcessInfo.nsh"
Var pid
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro customCheckAppRunning
  ; 動いていなければ何もしない（--quit を知らない古い版の exe を実行すると、普通に起動してしまうため）
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
  ${andIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DetailPrint "$(appClosing)"
    ; 待たずに実行する（古い版は --quit を知らず、窓を前に出すだけで終わらない）。終わるのを最長 10 秒待つ
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --quit'
    StrCpy $R1 0
    elecxstockWaitQuit:
      Sleep 500
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        IntOp $R1 $R1 + 1
        IntCmp $R1 20 0 elecxstockWaitQuit 0
      ${endIf}
  ${endIf}
  ; まだ残っていれば、electron-builder の今の処理（尋ねて止める）に任せる
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend

; アンインストール時（更新のときは除く）:
; - サインイン時の起動の登録（Run キーとタスクマネージャーの有効・無効）を消す（FR-BG6。データを残すかとは別に、無条件で）
; - 利用者のデータを残すか尋ねる（NFR-Q9）
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "dev.kurouna.elecxstock"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "dev.kurouna.elecxstock"
    MessageBox MB_YESNO|MB_ICONQUESTION "elecxstock のデータ（お気に入り・ウォッチリスト・取得した株価データ）も削除しますか？$\r$\nDelete elecxstock data (favorites, watchlists and fetched market data) too?" /SD IDNO IDNO keep
      RMDir /r "$APPDATA\elecxstock"
    keep:
  ${endIf}
!macroend
